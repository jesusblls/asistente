import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, db, recordAudit } from '@asistente/database';
import { auditSensitivityOf, type DoctorScheduleContext } from '@asistente/shared-types';
import { actorFromRequest } from '../../lib/audit.js';
import { parseLimit, requireEnum, requireRole, requireString } from '../../lib/http.js';
import { parseDate, parseJsonField } from './common.js';
import { auditQuerySchema } from './schemas.js';

type AuditRow = Awaited<ReturnType<typeof db.auditLog.findMany>>[number];

/**
 * Clasificación de sensibilidad de una fila: delega en
 * `@asistente/shared-types` (la misma regla que pinta los badges del panel)
 * para que "qué evento es sensible" no se decida dos veces de forma distinta.
 */
export function isRowSensitive(
  row: {
    action: string;
    entityType: string;
    actorType: string;
    actorRole?: string | null;
    actorId?: string | null;
    changes: unknown;
    metadata: unknown;
    createdAt: Date;
  },
  doctors: DoctorScheduleContext[]
): boolean {
  return (
    auditSensitivityOf(
      {
        action: row.action,
        entityType: row.entityType,
        actorType: row.actorType,
        actorRole: row.actorRole,
        actorId: row.actorId,
        changes: row.changes as Record<string, unknown> | null,
        metadata: row.metadata as Record<string, unknown> | null,
        createdAt: row.createdAt,
      },
      { doctors }
    ) !== null
  );
}

/** Filtros de la bitácora, compartidos por la consulta y la exportación. */
function auditWhere(tenantId: string, query: Record<string, string | undefined>) {
  const where: Record<string, unknown> = { tenantId };
  if (query.patientId) where.patientId = requireString(query.patientId, 'patientId', 100);
  if (query.entityId) where.entityId = requireString(query.entityId, 'entityId', 100);
  if (query.actorId) where.actorId = requireString(query.actorId, 'actorId', 100);
  if (query.entityType) {
    where.entityType = requireEnum(query.entityType, AUDIT_ENTITY_TYPES, 'entityType');
  }
  if (query.action) {
    // Acepta varias separadas por coma: el panel agrupa por categorías
    // (accesos, cambios, sesiones) y la exportación debe coincidir con eso.
    const actions = query.action
      .split(',')
      .map((action) => requireEnum(action.trim(), AUDIT_ACTIONS, 'action'));
    where.action = actions.length === 1 ? actions[0] : { in: actions };
  }
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from && { gte: parseDate(query.from, 'Fecha inicial') }),
      ...(query.to && { lte: parseDate(query.to, 'Fecha final') }),
    };
  }
  return where;
}

function auditFilters(query: Record<string, string | undefined>) {
  const { patientId, entityType, entityId, actorId, action, from, to, onlySensitive } = query;
  return { patientId, entityType, entityId, actorId, action, from, to, onlySensitive };
}

/** Cuántas filas se piden a la vez al paginar hacia atrás buscando sensibles. */
const SENSITIVE_SCAN_BATCH = 500;
/**
 * Tope duro de filas escaneadas al filtrar por sensibles. Los criterios
 * (fuera de horario según el doctor, cambios de pago, etc.) no se pueden
 * expresar en el `where` de Prisma, así que hay que traerlas y evaluarlas en
 * JS; este tope evita escanear el historial completo de una clínica vieja.
 */
const SENSITIVE_SCAN_MAX_ROWS = 5000;

/**
 * Trae filas de auditoría ya recortadas a `limit`, respetando `onlySensitive`.
 *
 * Cuando se pide solo sensibles, NO se puede traer `limit` filas y filtrar
 * después: eso devuelve "las sensibles entre las últimas N", no "las últimas
 * N sensibles" (un evento sensible viejo se pierde si hay N eventos
 * ordinarios más recientes). En su lugar se pagina hacia atrás en lotes de
 * `SENSITIVE_SCAN_BATCH`, acumulando sensibles hasta juntar `limit` o agotar
 * `SENSITIVE_SCAN_MAX_ROWS`.
 */
async function fetchAuditRows(
  tenantId: string,
  query: Record<string, string | undefined>,
  limit: number,
  onlySensitive: boolean
): Promise<AuditRow[]> {
  const where = auditWhere(tenantId, query);
  const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

  if (!onlySensitive) {
    return db.auditLog.findMany({ where, orderBy, take: limit });
  }

  const doctors = await db.doctor.findMany({
    where: { tenantId },
    select: { id: true, availabilityRules: true, isActive: true },
  });

  const result: AuditRow[] = [];
  let cursorId: string | undefined;
  let scanned = 0;

  while (result.length < limit && scanned < SENSITIVE_SCAN_MAX_ROWS) {
    const batch = await db.auditLog.findMany({
      where,
      orderBy,
      take: SENSITIVE_SCAN_BATCH,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    scanned += batch.length;

    for (const row of batch) {
      const sensitive = isRowSensitive(
        {
          ...row,
          changes: parseJsonField(row.changes),
          metadata: parseJsonField(row.metadata),
        },
        doctors
      );
      if (sensitive) {
        result.push(row);
        if (result.length >= limit) break;
      }
    }

    cursorId = batch[batch.length - 1].id;
    if (batch.length < SENSITIVE_SCAN_BATCH) break;
  }

  return result;
}

/**
 * Nombres del paciente y del empleado de cada fila. AuditLog no tiene
 * relaciones a propósito (sobrevive a los borrados), así que se resuelven
 * aparte y en lote; un paciente o usuario ya borrado sale con `null`.
 */
async function withNames(tenantId: string, rows: AuditRow[]) {
  const patientIds = [
    ...new Set(rows.map((row) => row.patientId).filter((id): id is string => !!id)),
  ];
  const actorIds = [
    ...new Set(
      rows
        .filter((row) => row.actorType === 'USER')
        .map((row) => row.actorId)
        .filter((id): id is string => !!id)
    ),
  ];

  const [patients, users] = await Promise.all([
    patientIds.length > 0
      ? db.patient.findMany({
          where: { tenantId, id: { in: patientIds } },
          select: { id: true, fullName: true, phoneE164: true },
        })
      : [],
    actorIds.length > 0
      ? db.user.findMany({
          where: { tenantId, id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);

  const patientById = new Map(patients.map((patient) => [patient.id, patient]));
  const userNameById = new Map(users.map((user) => [user.id, user.name]));

  return rows.map((row) => ({
    ...row,
    changes: parseJsonField(row.changes),
    metadata: parseJsonField(row.metadata),
    patient: row.patientId ? patientById.get(row.patientId) ?? null : null,
    actorName: row.actorId ? userNameById.get(row.actorId) ?? null : null,
  }));
}

const CSV_COLUMNS = [
  'fecha_hora_cdmx',
  'actor_tipo',
  'actor',
  'actor_correo',
  'actor_rol',
  'accion',
  'entidad',
  'entidad_id',
  'paciente',
  'paciente_id',
  'cambios',
  'detalle',
  'ip',
  'navegador',
  'request_id',
];

const cdmxTimestamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  // Una celda que empieza con = + - @ se ejecuta como fórmula al abrirla en
  // Excel. El nombre de WhatsApp de un paciente o el correo de un login
  // fallido los escribe un tercero: sin esto, exportar la bitácora le daría
  // a un atacante una fórmula en la computadora del director.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function auditRoutes(fastify: FastifyInstance) {
  /**
   * Bitácora de auditoría de la clínica (solo ADMIN).
   *
   * Responde "quién vio o modificó el expediente de este paciente": filtra por
   * `patientId`, entidad, actor, acción o rango de fechas. Consultarla también
   * queda registrado, porque la propia bitácora contiene datos sensibles.
   */
  fastify.get(
    '/api/audit',
    { schema: auditQuerySchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireRole(request, ['ADMIN']);
      const query = request.query as Record<string, string | undefined>;
      const onlySensitive = query.onlySensitive === 'true';
      const limit = parseLimit(query.limit, 100, 500);

      const rows = await fetchAuditRows(user.tenantId, query, limit, onlySensitive);

      await recordAudit({
        tenantId: user.tenantId,
        actor: actorFromRequest(request),
        action: 'LIST',
        entityType: 'AUDIT_LOG',
        patientId: query.patientId ?? null,
        metadata: { count: rows.length },
      });

      const named = await withNames(user.tenantId, rows);
      return reply.send(named);
    }
  );

  /**
   * Exporta en CSV exactamente lo filtrado (solo ADMIN). Se genera en el
   * servidor para que la exportación quede auditada: sacar la bitácora del
   * sistema es un acceso tan sensible como consultarla, y nunca se agrupa.
   */
  fastify.get(
    '/api/audit/export',
    { schema: auditQuerySchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireRole(request, ['ADMIN']);
      const query = request.query as Record<string, string | undefined>;
      const onlySensitive = query.onlySensitive === 'true';
      const limit = parseLimit(query.limit, 5000, 5000);

      const rows = await fetchAuditRows(user.tenantId, query, limit, onlySensitive);
      const named = await withNames(user.tenantId, rows);

      await recordAudit({
        tenantId: user.tenantId,
        actor: actorFromRequest(request),
        action: 'EXPORT',
        entityType: 'AUDIT_LOG',
        patientId: query.patientId ?? null,
        metadata: {
          count: named.length,
          filters: auditFilters(query),
          onlySensitive,
        },
      });

      const lines = [
        CSV_COLUMNS.join(','),
        ...named.map((row) =>
          [
            cdmxTimestamp.format(row.createdAt),
            row.actorType,
            row.actorName,
            row.actorEmail,
            row.actorRole,
            row.action,
            row.entityType,
            row.entityId,
            row.patient?.fullName,
            row.patientId,
            row.changes,
            row.metadata,
            row.ipAddress,
            row.userAgent,
            row.requestId,
          ]
            .map(csvCell)
            .join(',')
        ),
      ];

      const dateKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Mexico_City',
      }).format(new Date());

      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="bitacora-${dateKey}.csv"`);
      // El BOM hace que Excel abra el archivo como UTF-8 y respete los acentos.
      return reply.send(`﻿${lines.join('\r\n')}\r\n`);
    }
  );
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, db, recordAudit } from '@asistente/database';
import { actorFromRequest } from '../../lib/audit.js';
import { parseLimit, requireEnum, requireRole, requireString } from '../../lib/http.js';
import { parseDate, parseJsonField } from './common.js';
import { auditQuerySchema } from './schemas.js';

type AuditRow = Awaited<ReturnType<typeof db.auditLog.findMany>>[number];

interface DoctorWithRules {
  id: string;
  availabilityRules: string | null;
  isActive: boolean;
}

interface ParsedShift {
  start: number;
  end: number;
}

function parseTimeToMinutes(timeStr: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseDoctorRules(rules: unknown): Record<number, ParsedShift[]> | null {
  if (!rules) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof rules === 'string') {
    try {
      obj = JSON.parse(rules) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof rules === 'object' && rules !== null) {
    obj = rules as Record<string, unknown>;
  }
  if (!obj || typeof obj !== 'object' || !obj.days || typeof obj.days !== 'object') {
    return null;
  }
  const result: Record<number, ParsedShift[]> = {};
  for (const [dayKey, shifts] of Object.entries(obj.days as Record<string, unknown>)) {
    const dayNum = Number(dayKey);
    if (Number.isNaN(dayNum) || !Array.isArray(shifts)) continue;
    const parsedShifts: ParsedShift[] = [];
    for (const shift of shifts) {
      if (
        shift &&
        typeof shift === 'object' &&
        typeof (shift as Record<string, unknown>).start === 'string' &&
        typeof (shift as Record<string, unknown>).end === 'string'
      ) {
        const start = parseTimeToMinutes((shift as Record<string, string>).start);
        const end = parseTimeToMinutes((shift as Record<string, string>).end);
        if (start !== null && end !== null && end > start) {
          parsedShifts.push({ start, end });
        }
      }
    }
    if (parsedShifts.length > 0) {
      result[dayNum] = parsedShifts;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function isOutsideHours(
  createdAt: Date,
  doctors: DoctorWithRules[],
  targetDoctorId?: string | null
): boolean {
  const cdmxMs = createdAt.getTime() - 6 * 60 * 60 * 1000;
  const cdmxDate = new Date(cdmxMs);
  const dayOfWeek = cdmxDate.getUTCDay();
  const hour = cdmxDate.getUTCHours();
  const minutesOfDay = hour * 60 + cdmxDate.getUTCMinutes();
  const tolerance = 30;

  if (doctors.length > 0) {
    if (targetDoctorId) {
      const doc = doctors.find((d) => d.id === targetDoctorId);
      if (doc) {
        const rules = parseDoctorRules(doc.availabilityRules);
        if (rules) {
          const shifts = rules[dayOfWeek];
          if (!shifts || shifts.length === 0) return true;
          const inShift = shifts.some(
            (s) => minutesOfDay >= s.start - tolerance && minutesOfDay <= s.end + tolerance
          );
          return !inShift;
        }
      }
    }

    let hadAnyValidRules = false;
    let anyWorking = false;
    for (const doc of doctors) {
      if (doc.isActive === false) continue;
      const rules = parseDoctorRules(doc.availabilityRules);
      if (!rules) continue;
      hadAnyValidRules = true;
      const shifts = rules[dayOfWeek];
      if (
        shifts &&
        shifts.some((s) => minutesOfDay >= s.start - tolerance && minutesOfDay <= s.end + tolerance)
      ) {
        anyWorking = true;
        break;
      }
    }
    if (hadAnyValidRules) {
      return !anyWorking;
    }
  }

  return hour < 7 || hour >= 21;
}

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
  doctors: DoctorWithRules[]
): boolean {
  if (row.action === 'LOGIN_FAILED') return true;
  if (row.action === 'DELETE') return true;
  if (row.action === 'EXPORT') return true;
  if (row.action === 'UPDATE' && row.actorType === 'USER') {
    const changes = row.changes as Record<string, unknown> | null;
    if (changes && typeof changes === 'object' && 'paymentStatus' in changes) return true;
  }
  const reviewingAudit = row.action === 'LIST' && row.entityType === 'AUDIT_LOG';
  if (row.actorType === 'USER' && !reviewingAudit) {
    const metadata = row.metadata as Record<string, unknown> | null;
    const doctorId =
      (metadata?.doctorId as string | undefined) ||
      (row.actorRole === 'DOCTOR' ? (row.actorId ?? undefined) : undefined);
    if (isOutsideHours(row.createdAt, doctors, doctorId)) {
      return true;
    }
  }
  return false;
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
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function auditRoutes(fastify: FastifyInstance) {
  /**
   * Bitácora de auditoría de la clínica (solo ADMIN).
   */
  fastify.get(
    '/api/audit',
    { schema: auditQuerySchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireRole(request, ['ADMIN']);
      const query = request.query as Record<string, string | undefined>;

      const rows = await db.auditLog.findMany({
        where: auditWhere(user.tenantId, query),
        orderBy: { createdAt: 'desc' },
        take: parseLimit(query.limit, 100, 500),
      });

      await recordAudit({
        tenantId: user.tenantId,
        actor: actorFromRequest(request),
        action: 'LIST',
        entityType: 'AUDIT_LOG',
        patientId: query.patientId ?? null,
        metadata: { count: rows.length },
      });

      let named = await withNames(user.tenantId, rows);
      if (query.onlySensitive === 'true') {
        const doctors = await db.doctor.findMany({
          where: { tenantId: user.tenantId },
          select: { id: true, availabilityRules: true, isActive: true },
        });
        named = named.filter((row) => isRowSensitive(row, doctors));
      }

      return reply.send(named);
    }
  );

  /**
   * Exporta en CSV exactamente lo filtrado (solo ADMIN). Se genera en el
   * servidor para que la exportación quede auditada.
   */
  fastify.get(
    '/api/audit/export',
    { schema: auditQuerySchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireRole(request, ['ADMIN']);
      const query = request.query as Record<string, string | undefined>;

      const rows = await db.auditLog.findMany({
        where: auditWhere(user.tenantId, query),
        orderBy: { createdAt: 'desc' },
        take: parseLimit(query.limit, 5000, 5000),
      });
      let named = await withNames(user.tenantId, rows);

      if (query.onlySensitive === 'true') {
        const doctors = await db.doctor.findMany({
          where: { tenantId: user.tenantId },
          select: { id: true, availabilityRules: true, isActive: true },
        });
        named = named.filter((row) => isRowSensitive(row, doctors));
      }

      await recordAudit({
        tenantId: user.tenantId,
        actor: actorFromRequest(request),
        action: 'EXPORT',
        entityType: 'AUDIT_LOG',
        patientId: query.patientId ?? null,
        metadata: {
          count: named.length,
          filters: auditFilters(query),
          onlySensitive: query.onlySensitive === 'true',
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
      return reply.send(`﻿${lines.join('\r\n')}\r\n`);
    }
  );
}

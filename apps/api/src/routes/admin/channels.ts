import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, decryptCredentials, encryptCredentials, recordAudit, type Prisma } from '@asistente/database';
import {
  MERCADOPAGO_CHANNEL,
  normalizeMexicanPhone,
  type MercadoPagoChannelCredentials,
} from '@asistente/ai-agent';
import { actorFromRequest } from '../../lib/audit.js';
import { HttpError, requireRole } from '../../lib/http.js';
import {
  META_GRAPH_BASE,
  WhatsAppService,
  type WhatsAppChannelCredentials,
} from '../../services/whatsappService.js';

/**
 * Canales de la clínica (número propio de WhatsApp y estado de voz y pagos).
 *
 * Decisión del dueño del producto: cada clínica atiende desde su propio número
 * de WhatsApp. El modelo `ChannelConfig` (credenciales cifradas) ya existía y el
 * webhook de entrada lo consultaba para saber a qué clínica pertenece un
 * mensaje, pero nada creaba esas filas y todos los envíos salían por el número
 * global de la plataforma. Estas rutas son la forma de darlas de alta.
 *
 * Reglas:
 *  - Solo el ADMIN de la clínica: un token de WhatsApp permite escribirle a
 *    cualquier paciente a nombre de la clínica.
 *  - Nunca se devuelve el token: el panel solo ve sus últimos 4 caracteres para
 *    reconocer cuál está guardado.
 *  - La clínica siempre es la de la sesión; no hay parámetro de tenant que
 *    alguien pudiera cambiar para leer o pisar la configuración de otra.
 *  - En producción el número se verifica con Meta antes de guardarlo. El
 *    webhook de entrada enruta por `phoneNumberId`: sin esa verificación, un
 *    admin podría capturar el ID de otra clínica (o el compartido de la
 *    plataforma) con un token cualquiera y recibir en su bandeja los mensajes
 *    de pacientes ajenos. Solo un token con acceso real al número pasa.
 */

const WHATSAPP = 'WHATSAPP';

const putWhatsAppSchema = {
  body: {
    type: 'object',
    required: ['phoneNumberId', 'displayPhoneNumber'],
    properties: {
      phoneNumberId: { type: 'string', minLength: 5, maxLength: 40 },
      // Opcional al editar: vacío conserva el token ya guardado.
      accessToken: { type: 'string', maxLength: 1024 },
      displayPhoneNumber: { type: 'string', minLength: 8, maxLength: 30 },
      wabaId: { type: 'string', maxLength: 40 },
    },
    additionalProperties: false,
  },
};

interface WhatsAppStatus {
  configured: boolean;
  /** CLINIC: número propio · PLATFORM: número global de respaldo · NONE: sin envío real. */
  source: 'CLINIC' | 'PLATFORM' | 'NONE';
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  tokenLast4: string | null;
  connectedAt: string | null;
  /** false si la fila existe pero no se pudo descifrar (llave rotada, datos corruptos). */
  readable: boolean;
}

function digitsOnly(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^\d{5,40}$/.test(trimmed)) {
    throw new HttpError(400, `${field} debe contener solo dígitos (cópialo de Meta Business)`);
  }
  return trimmed;
}

function requireDisplayPhone(value: string): string {
  const normalized = normalizeMexicanPhone(value);
  if (!/^\+\d{8,15}$/.test(normalized)) {
    throw new HttpError(400, 'Número de WhatsApp inválido: usa formato E.164 (+52XXXXXXXXXX)');
  }
  return normalized;
}

function last4(token: string | undefined): string | null {
  return token && token.length >= 8 ? token.slice(-4) : null;
}

async function findWhatsAppConfig(tenantId: string) {
  return db.channelConfig.findFirst({ where: { tenantId, channelType: WHATSAPP } });
}

function readCredentials(stored: string): WhatsAppChannelCredentials | null {
  try {
    return JSON.parse(decryptCredentials(stored)) as WhatsAppChannelCredentials;
  } catch {
    return null;
  }
}

/**
 * El webhook de entrada enruta por `phoneNumberId`; si dos clínicas tuvieran el
 * mismo, los mensajes de una acabarían en la bandeja de la otra. Se consulta
 * dentro de la transacción que guarda, bajo un candado (ver PUT).
 */
async function phoneNumberIdTakenByOther(
  tx: Prisma.TransactionClient,
  tenantId: string,
  phoneNumberId: string
): Promise<boolean> {
  const configs = await tx.channelConfig.findMany({
    where: { channelType: WHATSAPP, NOT: { tenantId } },
    select: { credentials: true },
  });
  return configs.some((config) => readCredentials(config.credentials)?.phoneNumberId === phoneNumberId);
}

interface MetaVerification {
  ok: boolean;
  reason?: 'NETWORK' | 'UNAUTHORIZED' | 'META_ERROR';
  status?: number;
  message?: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
}

/** `GET /{phone-number-id}` con el token: prueba que el token controla ese número. No envía mensajes. */
async function verifyWithMeta(phoneNumberId: string, accessToken: string): Promise<MetaVerification> {
  const url = `${META_GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return {
      ok: false,
      reason: 'NETWORK',
      message: 'No se pudo contactar a Meta desde el servidor. Revisa la conexión a internet de la API.',
    };
  }

  const data = (await response.json().catch(() => ({}))) as {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
  };

  if (!response.ok) {
    const unauthorized = response.status === 401 || response.status === 403;
    return {
      ok: false,
      reason: unauthorized ? 'UNAUTHORIZED' : 'META_ERROR',
      status: response.status,
      message: unauthorized
        ? 'Meta rechazó el token: puede estar vencido o no tener permiso sobre este número.'
        : `Meta respondió con error (${response.status}). Verifica el Phone Number ID y que el token tenga acceso a ese número.`,
    };
  }

  return {
    ok: true,
    displayPhoneNumber: data.display_phone_number ?? null,
    verifiedName: data.verified_name ?? null,
    qualityRating: data.quality_rating ?? null,
  };
}

async function buildWhatsAppStatus(tenantId: string): Promise<WhatsAppStatus> {
  const config = await findWhatsAppConfig(tenantId);
  const platformConfigured = Boolean(process.env.META_WHATSAPP_TOKEN && process.env.META_PHONE_NUMBER_ID);

  if (config) {
    const credentials = readCredentials(config.credentials);
    const usable = Boolean(config.isActive && credentials?.accessToken && credentials.phoneNumberId);
    return {
      configured: usable,
      source: usable ? 'CLINIC' : platformConfigured ? 'PLATFORM' : 'NONE',
      phoneNumberId: credentials?.phoneNumberId ?? null,
      displayPhoneNumber: credentials?.displayPhoneNumber ?? null,
      wabaId: credentials?.wabaId ?? null,
      tokenLast4: last4(credentials?.accessToken),
      connectedAt: config.createdAt.toISOString(),
      readable: credentials !== null,
    };
  }

  return {
    configured: false,
    source: platformConfigured ? 'PLATFORM' : 'NONE',
    phoneNumberId: null,
    displayPhoneNumber: null,
    wabaId: null,
    tokenLast4: null,
    connectedAt: null,
    readable: true,
  };
}

const MP_API_BASE = process.env.MERCADOPAGO_API_BASE || 'https://api.mercadopago.com';

const putMercadoPagoSchema = {
  body: {
    type: 'object',
    required: ['accessToken'],
    properties: { accessToken: { type: 'string', minLength: 1, maxLength: 512 } },
    additionalProperties: false,
  },
};

interface MercadoPagoStatus {
  configured: boolean;
  /** CLINIC: cuenta propia · NONE: sin cuenta (en producción no se generan links de anticipo). */
  source: 'CLINIC' | 'NONE';
  userId: string | null;
  nickname: string | null;
  tokenLast4: string | null;
  connectedAt: string | null;
  readable: boolean;
  /** Token de prueba (TEST-…): cobra en sandbox, no dinero real. */
  testMode: boolean;
}

interface MercadoPagoVerification {
  ok: boolean;
  reason?: 'NETWORK' | 'UNAUTHORIZED' | 'WRONG_COUNTRY' | 'MP_ERROR';
  message?: string;
  userId?: string;
  nickname?: string | null;
  siteId?: string | null;
}

/** `GET /users/me` con el token: dice de quién es la cuenta. No cobra ni crea nada. */
async function verifyWithMercadoPago(accessToken: string): Promise<MercadoPagoVerification> {
  let response: Response;
  try {
    response = await fetch(`${MP_API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, reason: 'NETWORK', message: 'No se pudo contactar a Mercado Pago desde el servidor.' };
  }
  const data = (await response.json().catch(() => ({}))) as { id?: number | string; nickname?: string; site_id?: string };
  if (!response.ok || data.id === undefined) {
    const unauthorized = response.status === 401 || response.status === 403;
    return {
      ok: false,
      reason: unauthorized ? 'UNAUTHORIZED' : 'MP_ERROR',
      message: unauthorized
        ? 'Mercado Pago rechazó el token: revisa que sea el Access Token de producción completo.'
        : `Mercado Pago respondió con error (${response.status}).`,
    };
  }
  // Los anticipos son en pesos: una cuenta de otro país no puede cobrar MXN.
  if (data.site_id && data.site_id !== 'MLM') {
    return {
      ok: false,
      reason: 'WRONG_COUNTRY',
      message: 'Esa cuenta de Mercado Pago no es de México: no puede cobrar anticipos en pesos.',
      userId: String(data.id),
      siteId: data.site_id,
    };
  }
  return { ok: true, userId: String(data.id), nickname: data.nickname ?? null, siteId: data.site_id ?? null };
}

function readMercadoPagoCredentials(stored: string): MercadoPagoChannelCredentials | null {
  try {
    return JSON.parse(decryptCredentials(stored)) as MercadoPagoChannelCredentials;
  } catch {
    return null;
  }
}

async function findMercadoPagoConfig(tenantId: string) {
  return db.channelConfig.findFirst({ where: { tenantId, channelType: MERCADOPAGO_CHANNEL } });
}

async function buildMercadoPagoStatus(tenantId: string): Promise<MercadoPagoStatus> {
  const config = await findMercadoPagoConfig(tenantId);
  if (!config) {
    return { configured: false, source: 'NONE', userId: null, nickname: null, tokenLast4: null, connectedAt: null, readable: true, testMode: false };
  }
  const credentials = readMercadoPagoCredentials(config.credentials);
  const usable = Boolean(config.isActive && credentials?.accessToken);
  return {
    configured: usable,
    source: usable ? 'CLINIC' : 'NONE',
    userId: credentials?.userId ?? null,
    nickname: credentials?.nickname ?? null,
    tokenLast4: last4(credentials?.accessToken),
    connectedAt: config.createdAt.toISOString(),
    readable: credentials !== null,
    testMode: Boolean(credentials?.accessToken?.startsWith('TEST-')),
  };
}

export async function channelRoutes(fastify: FastifyInstance) {
  fastify.get('/api/channels', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireRole(request, ['ADMIN']);
    const tenant = await db.tenant.findFirst({
      where: { id: user.tenantId },
      select: { phoneE164: true },
    });

    return reply.send({
      whatsapp: await buildWhatsAppStatus(user.tenantId),
      // Voz y pagos todavía son cuentas de la plataforma, no por clínica: se
      // informa con honestidad si la plataforma los tiene configurados.
      voice: {
        configured: Boolean(process.env.TWILIO_AUTH_TOKEN),
        scope: 'PLATFORM',
        phoneE164: tenant?.phoneE164 ?? null,
      },
      mercadoPago: await buildMercadoPagoStatus(user.tenantId),
    });
  });

  /**
   * Conecta la cuenta de Mercado Pago de la clínica: a ella llegan los
   * anticipos de sus pacientes. Solo ADMIN, token cifrado, nunca devuelto.
   */
  fastify.put(
    '/api/channels/mercadopago',
    { schema: putMercadoPagoSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireRole(request, ['ADMIN']);
      const tenantId = user.tenantId;
      const accessToken = (request.body as { accessToken: string }).accessToken.trim();

      if (accessToken.length < 20 || /\s/.test(accessToken)) {
        throw new HttpError(400, 'El Access Token no parece válido (cópialo completo desde Mercado Pago)');
      }
      // En producción solo dinero real: un token TEST- generaría links de
      // sandbox que el paciente "paga" sin que llegue nada a la clínica.
      if (process.env.NODE_ENV === 'production' && !accessToken.startsWith('APP_USR-')) {
        throw new HttpError(400, 'Usa el Access Token de producción (empieza con APP_USR-), no el de prueba');
      }

      const verification = await verifyWithMercadoPago(accessToken);
      if (!verification.ok && (process.env.NODE_ENV === 'production' || verification.reason === 'WRONG_COUNTRY')) {
        throw new HttpError(verification.reason === 'NETWORK' ? 503 : 400, verification.message ?? 'Mercado Pago no verificó el token');
      }

      const credentials: MercadoPagoChannelCredentials = {
        accessToken,
        userId: verification.userId ?? 'sin-verificar',
        nickname: verification.nickname ?? null,
      };
      let encrypted: string;
      try {
        encrypted = encryptCredentials(JSON.stringify(credentials));
      } catch {
        throw new HttpError(503, 'El servidor no tiene configurado el cifrado de credenciales');
      }

      const existing = await findMercadoPagoConfig(tenantId);
      await db.$transaction(async (tx) => {
        const row = await tx.channelConfig.upsert({
          where: { tenantId_channelType: { tenantId, channelType: MERCADOPAGO_CHANNEL } },
          create: { tenantId, channelType: MERCADOPAGO_CHANNEL, credentials: encrypted, isActive: true },
          update: { credentials: encrypted, isActive: true },
        });
        await recordAudit(
          {
            tenantId,
            actor: actorFromRequest(request),
            action: existing ? 'UPDATE' : 'CREATE',
            entityType: 'CHANNEL_CONFIG',
            entityId: row.id,
            metadata: {
              channel: MERCADOPAGO_CHANNEL,
              mercadoPagoUserId: credentials.userId,
              verifiedWithMercadoPago: verification.ok,
            },
          },
          tx
        );
      });

      return reply.send({ mercadoPago: await buildMercadoPagoStatus(tenantId), verification });
    }
  );

  /** Verifica el token guardado contra Mercado Pago (`GET /users/me`). No cobra nada. */
  fastify.post('/api/channels/mercadopago/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireRole(request, ['ADMIN']);
    const config = await findMercadoPagoConfig(user.tenantId);
    if (!config) throw new HttpError(404, 'Primero conecta la cuenta de Mercado Pago de la clínica');
    const credentials = readMercadoPagoCredentials(config.credentials);
    if (!credentials?.accessToken) {
      return reply.send({ ok: false, reason: 'UNREADABLE', message: 'Las credenciales guardadas no se pueden leer. Vuelve a capturarlas.' });
    }
    return reply.send(await verifyWithMercadoPago(credentials.accessToken));
  });

  fastify.delete('/api/channels/mercadopago', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireRole(request, ['ADMIN']);
    const tenantId = user.tenantId;
    const existing = await findMercadoPagoConfig(tenantId);
    if (!existing) throw new HttpError(404, 'La clínica no tiene Mercado Pago conectado');
    const previous = readMercadoPagoCredentials(existing.credentials);
    await db.$transaction(async (tx) => {
      await tx.channelConfig.deleteMany({ where: { id: existing.id, tenantId } });
      await recordAudit(
        {
          tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'CHANNEL_CONFIG',
          entityId: existing.id,
          metadata: { channel: MERCADOPAGO_CHANNEL, mercadoPagoUserId: previous?.userId ?? null },
        },
        tx
      );
    });
    return reply.send({ mercadoPago: await buildMercadoPagoStatus(tenantId) });
  });

  fastify.put(
    '/api/channels/whatsapp',
    { schema: putWhatsAppSchema },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = requireRole(request, ['ADMIN']);
      const tenantId = user.tenantId;
      const body = request.body as {
        phoneNumberId: string;
        accessToken?: string;
        displayPhoneNumber: string;
        wabaId?: string;
      };

      const phoneNumberId = digitsOnly(body.phoneNumberId, 'Phone Number ID');
      const displayPhoneNumber = requireDisplayPhone(body.displayPhoneNumber);
      const wabaId = body.wabaId?.trim() ? digitsOnly(body.wabaId, 'WABA ID') : undefined;
      const newToken = body.accessToken?.trim() || '';
      if (newToken && (newToken.length < 20 || /\s/.test(newToken))) {
        throw new HttpError(400, 'El token de acceso no parece válido (copia el token permanente completo)');
      }

      const existing = await findWhatsAppConfig(tenantId);
      const previous = existing ? readCredentials(existing.credentials) : null;
      const accessToken = newToken || previous?.accessToken || '';
      if (!accessToken) {
        throw new HttpError(400, 'El token de acceso es obligatorio la primera vez');
      }

      if (process.env.META_PHONE_NUMBER_ID && phoneNumberId === process.env.META_PHONE_NUMBER_ID.trim()) {
        throw new HttpError(409, 'Ese es el número compartido de la plataforma; captura el número propio de la clínica');
      }

      // En producción solo se guarda un número que Meta confirma para ese token.
      // En desarrollo se permite guardar sin verificar (sandbox sin red o con
      // datos de prueba), pero la respuesta lo dice para que el panel avise.
      const verification = await verifyWithMeta(phoneNumberId, accessToken);
      if (!verification.ok && process.env.NODE_ENV === 'production') {
        throw new HttpError(verification.reason === 'NETWORK' ? 503 : 400, verification.message ?? 'Meta no verificó el número');
      }

      const credentials: WhatsAppChannelCredentials = {
        phoneNumberId,
        accessToken,
        displayPhoneNumber,
        ...(wabaId ? { wabaId } : {}),
      };
      let encrypted: string;
      try {
        encrypted = encryptCredentials(JSON.stringify(credentials));
      } catch {
        // Producción sin CREDENTIALS_ENCRYPTION_KEY: se falla en cerrado en vez
        // de guardar el token en claro.
        throw new HttpError(503, 'El servidor no tiene configurado el cifrado de credenciales');
      }

      await db.$transaction(async (tx) => {
        // Candado de transacción: dos clínicas guardando el mismo número a la
        // vez verían ambas "libre" sin él. El ID va cifrado, así que no puede
        // haber un índice único que lo impida en la base.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('channel_config:whatsapp'))`;
        if (await phoneNumberIdTakenByOther(tx, tenantId, phoneNumberId)) {
          throw new HttpError(409, 'Ese número de WhatsApp ya está vinculado a otra clínica');
        }

        const row = await tx.channelConfig.upsert({
          where: { tenantId_channelType: { tenantId, channelType: WHATSAPP } },
          create: { tenantId, channelType: WHATSAPP, credentials: encrypted, isActive: true },
          update: { credentials: encrypted, isActive: true },
        });

        // Sin secretos en la auditoría: solo qué número y si cambió el token.
        await recordAudit(
          {
            tenantId,
            actor: actorFromRequest(request),
            action: existing ? 'UPDATE' : 'CREATE',
            entityType: 'CHANNEL_CONFIG',
            entityId: row.id,
            metadata: {
              channel: WHATSAPP,
              phoneNumberId,
              displayPhoneNumber,
              tokenChanged: Boolean(newToken) && newToken !== previous?.accessToken,
              verifiedWithMeta: verification.ok,
            },
          },
          tx
        );
      });

      WhatsAppService.invalidateCredentials(tenantId);
      return reply.send({ whatsapp: await buildWhatsAppStatus(tenantId), verification });
    }
  );

  /**
   * Verifica contra Meta que el Phone Number ID y el token guardados funcionan
   * (`GET /{phone-number-id}`). No envía ningún mensaje.
   */
  fastify.post('/api/channels/whatsapp/test', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireRole(request, ['ADMIN']);
    const config = await findWhatsAppConfig(user.tenantId);
    if (!config) {
      throw new HttpError(404, 'Primero guarda las credenciales de WhatsApp de la clínica');
    }

    if (!config.isActive) {
      return reply.send({ ok: false, reason: 'INACTIVE', message: 'El canal de WhatsApp de la clínica está desactivado.' });
    }

    const credentials = readCredentials(config.credentials);
    if (!credentials?.accessToken || !credentials.phoneNumberId) {
      return reply.send({
        ok: false,
        reason: 'UNREADABLE',
        message: 'Las credenciales guardadas no se pueden leer. Vuelve a capturarlas.',
      });
    }

    return reply.send(await verifyWithMeta(credentials.phoneNumberId, credentials.accessToken));
  });

  fastify.delete('/api/channels/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireRole(request, ['ADMIN']);
    const tenantId = user.tenantId;
    const existing = await findWhatsAppConfig(tenantId);
    if (!existing) {
      throw new HttpError(404, 'La clínica no tiene un número de WhatsApp propio configurado');
    }

    const previous = readCredentials(existing.credentials);
    await db.$transaction(async (tx) => {
      await tx.channelConfig.deleteMany({ where: { id: existing.id, tenantId } });
      await recordAudit(
        {
          tenantId,
          actor: actorFromRequest(request),
          action: 'DELETE',
          entityType: 'CHANNEL_CONFIG',
          entityId: existing.id,
          metadata: {
            channel: WHATSAPP,
            phoneNumberId: previous?.phoneNumberId ?? null,
            displayPhoneNumber: previous?.displayPhoneNumber ?? null,
          },
        },
        tx
      );
    });

    WhatsAppService.invalidateCredentials(tenantId);
    return reply.send({ whatsapp: await buildWhatsAppStatus(tenantId) });
  });
}

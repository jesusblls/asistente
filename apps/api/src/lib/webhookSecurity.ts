import { createHmac, timingSafeEqual } from 'node:crypto';
import { createLogger } from '@asistente/observability';
import { HttpError } from './http.js';

const logger = createLogger('webhooks');

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Escape hatch exclusivo de desarrollo/pruebas. En producción se ignora.
 */
function devSkipEnabled(): boolean {
  return !isProduction() && process.env.WEBHOOK_ALLOW_UNVERIFIED === 'true';
}

function missingSecret(message: string): void {
  if (devSkipEnabled()) {
    logger.warn(`${message} (verificación omitida por WEBHOOK_ALLOW_UNVERIFIED=true, solo desarrollo)`);
    return;
  }
  throw new HttpError(503, message);
}

export function computeMetaSignature(rawBody: Buffer, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

export function computeTwilioSignature(
  url: string,
  body: Record<string, unknown>,
  authToken: string
): string {
  const data = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + String(body[key] ?? ''), url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export function computeMercadoPagoSignature(params: {
  dataId: string;
  requestId?: string;
  ts: string;
  secret: string;
}): string {
  const manifest = `id:${params.dataId};request-id:${params.requestId || ''};ts:${params.ts};`;
  return createHmac('sha256', params.secret).update(manifest).digest('hex');
}

/**
 * Verifica la firma X-Hub-Signature-256 de Meta (WhatsApp/IG/Messenger).
 */
export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret = process.env.META_APP_SECRET
): void {
  if (!appSecret) {
    return missingSecret('Webhook de Meta no configurado: falta META_APP_SECRET');
  }
  if (!rawBody || !signatureHeader) {
    if (devSkipEnabled()) return;
    throw new HttpError(401, 'Firma de Meta ausente');
  }

  const expected = computeMetaSignature(rawBody, appSecret);
  if (!safeEqual(expected, signatureHeader)) {
    throw new HttpError(401, 'Firma de Meta inválida');
  }
}

/**
 * Verifica X-Twilio-Signature (HMAC-SHA1 sobre URL + parámetros ordenados).
 */
export function verifyTwilioSignature(params: {
  url: string;
  body: Record<string, unknown>;
  signature?: string;
  authToken?: string;
}): void {
  const authToken = params.authToken ?? process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return missingSecret('Webhook de Twilio no configurado: falta TWILIO_AUTH_TOKEN');
  }
  if (!params.signature) {
    if (devSkipEnabled()) return;
    throw new HttpError(401, 'Firma de Twilio ausente');
  }

  const expected = computeTwilioSignature(params.url, params.body, authToken);
  if (!safeEqual(expected, params.signature)) {
    throw new HttpError(401, 'Firma de Twilio inválida');
  }
}

/**
 * Verifica la firma x-signature de Mercado Pago.
 * Manifiesto oficial: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 */
export function verifyMercadoPagoSignature(params: {
  dataId?: string;
  requestId?: string;
  signatureHeader?: string;
  secret?: string;
}): void {
  const secret = params.secret ?? process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    return missingSecret('Webhook de Mercado Pago no configurado: falta MERCADOPAGO_WEBHOOK_SECRET');
  }
  if (!params.signatureHeader || !params.dataId) {
    if (devSkipEnabled()) return;
    throw new HttpError(401, 'Firma de Mercado Pago ausente');
  }

  const parts = params.signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) throw new HttpError(401, 'Firma de Mercado Pago inválida');

  // Sin ventana de frescura, una notificación legítima capturada una vez se
  // puede reenviar para siempre y volver a marcar como pagado un anticipo ya
  // reembolsado. Mercado Pago firma el `ts`, así que no se puede falsificar.
  const toleranceMs = Number(process.env.MERCADOPAGO_SIGNATURE_TOLERANCE_MS || 5 * 60 * 1000);
  const timestampMs = Number(ts) * (ts.length > 10 ? 1 : 1000);
  if (!Number.isFinite(timestampMs)) {
    throw new HttpError(401, 'Firma de Mercado Pago inválida');
  }
  if (Math.abs(Date.now() - timestampMs) > toleranceMs) {
    throw new HttpError(401, 'Firma de Mercado Pago expirada');
  }

  const expected = computeMercadoPagoSignature({
    dataId: params.dataId,
    requestId: params.requestId,
    ts,
    secret,
  });
  const expectedLower = computeMercadoPagoSignature({
    dataId: params.dataId.toLowerCase(),
    requestId: params.requestId,
    ts,
    secret,
  });

  if (!safeEqual(expected, v1) && !safeEqual(expectedLower, v1)) {
    throw new HttpError(401, 'Firma de Mercado Pago inválida');
  }
}

export function maskPhone(phone?: string | null): string {
  if (!phone) return '(sin teléfono)';
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '****';
  return `+${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

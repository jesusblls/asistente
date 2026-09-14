/**
 * @asistente/observability
 *
 * Logging estructurado y métricas mínimas del proceso, sin dependencias externas.
 *
 * Reglas de privacidad (regla C6 de la auditoría):
 *  - Nunca se registran teléfonos, correos ni contenido de mensajes en claro.
 *  - Las claves sensibles del contexto (tokens, contraseñas, firmas) se enmascaran.
 *  - En producción los errores se serializan sin `stack` para no filtrar rutas internas.
 *
 * El formato de salida es JSON de una línea por evento (NDJSON), listo para
 * ingesta en Loki / CloudWatch / Datadog, y legible en desarrollo.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Claves cuyo valor jamás debe salir en un log. */
const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|auth|cookie|api[_-]?key|credential|signature|hash|salt)/i;

const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/;

/** Enmascara un teléfono conservando país y últimos 3 dígitos: +525512345678 -> "+52******678". */
export function maskPhone(phone?: string | null): string {
  if (!phone) return '***';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return '***';
  const tail = digits.slice(-3);
  const country = digits.startsWith('52') ? '+52' : '';
  return `${country}${'*'.repeat(Math.max(digits.length - 3 - country.length, 2))}${tail}`;
}

/** Enmascara un correo: maria.lopez@clinica.mx -> "ma***@clinica.mx". */
export function maskEmail(email?: string | null): string {
  if (!email) return '***';
  const [user, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = user.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(user.length - 2, 2))}@${domain}`;
}

/** Trunca texto libre (síntomas, mensajes) para que no quede PHI completa en los logs. */
export function truncate(value: string, max = 60): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

/**
 * Copia profunda de un objeto enmascarando claves sensibles y teléfonos.
 * Se aplica a todo `context` antes de serializar.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return PHONE_PATTERN.test(value) ? value.replace(PHONE_PATTERN, maskPhone(value)) : value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    // Errores: se normalizan aparte para no perder mensaje/stack controlado.
    if (source instanceof Error) return serializeError(source, true);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redact(item, depth + 1);
    }
    return out;
  }

  return '[unserializable]';
}

/** Serializa un error sin filtrar rutas del servidor cuando `includeStack` es false. */
export function serializeError(error: unknown, includeStack = false): Record<string, unknown> {
  if (error instanceof Error) {
    const payload: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    // Códigos de Prisma/Fastify son útiles para diagnóstico y no son sensibles.
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') payload.code = code;
    if (includeStack && error.stack) payload.stack = error.stack.split('\n').slice(0, 8).join('\n');
    return payload;
  }
  return { message: String(error) };
}

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: unknown, context?: LogContext): void;
  child(bindings: LogContext & { component?: string }): Logger;
  level: LogLevel;
}

function resolveLevel(explicit?: LogLevel): LogLevel {
  if (explicit) return explicit;
  const fromEnv = (process.env.LOG_LEVEL || '').toLowerCase();
  if (fromEnv && fromEnv in LEVEL_WEIGHT) return fromEnv as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function write(level: Exclude<LogLevel, 'silent'>, name: string, message: string, context: LogContext) {
  const payload: LogContext = {
    ts: new Date().toISOString(),
    level,
    logger: name,
    msg: message,
    ...(redact(context) as LogContext),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

class StructuredLogger implements Logger {
  readonly level: LogLevel;
  private readonly name: string;
  private readonly bindings: LogContext;

  constructor(name: string, bindings: LogContext = {}, level?: LogLevel) {
    this.name = name;
    this.bindings = bindings;
    this.level = resolveLevel(level);
  }

  private enabled(level: Exclude<LogLevel, 'silent'>): boolean {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[this.level];
  }

  private emit(level: Exclude<LogLevel, 'silent'>, message: string, context: LogContext = {}) {
    if (!this.enabled(level)) return;
    write(level, this.name, message, { ...this.bindings, ...context });
  }

  debug(message: string, context?: LogContext) {
    this.emit('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.emit('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.emit('warn', message, context);
  }

  error(message: string, error?: unknown, context?: LogContext) {
    this.emit('error', message, {
      ...context,
      err: error === undefined ? undefined : serializeError(error, this.level === 'debug'),
    });
  }

  child(bindings: LogContext & { component?: string }): Logger {
    const childName = bindings.component ? `${this.name}:${bindings.component}` : this.name;
    return new StructuredLogger(childName, { ...this.bindings, ...bindings }, this.level);
  }
}

const cache = new Map<string, Logger>();

/** Crea (o reutiliza) un logger con nombre. `createLogger('api:webhooks')`. */
export function createLogger(name: string, bindings: LogContext = {}): Logger {
  const key = `${name}:${JSON.stringify(bindings)}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const logger = new StructuredLogger(name, bindings);
  cache.set(key, logger);
  return logger;
}

// ---------------------------------------------------------------------------
// Métricas mínimas en proceso (contadores + histograma simple de latencias)
// ---------------------------------------------------------------------------

type MetricKind = 'counter' | 'timing';

interface MetricEntry {
  kind: MetricKind;
  count: number;
  sum: number;
  max: number;
  labels: Record<string, string>;
}

const metrics = new Map<string, MetricEntry>();

function metricKey(name: string, labels: Record<string, string>): string {
  const labelPart = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',');
  return labelPart ? `${name}{${labelPart}}` : name;
}

/** Incrementa un contador, p. ej. `incrementCounter('webhook_rejected_total', { provider: 'META' })`. */
export function incrementCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
  const key = metricKey(name, labels);
  const current = metrics.get(key) ?? { kind: 'counter', count: 0, sum: 0, max: 0, labels };
  current.count += value;
  metrics.set(key, current);
}

/** Registra una duración en milisegundos. */
export function recordTiming(name: string, durationMs: number, labels: Record<string, string> = {}): void {
  const key = metricKey(name, labels);
  const current = metrics.get(key) ?? { kind: 'timing', count: 0, sum: 0, max: 0, labels };
  current.count += 1;
  current.sum += durationMs;
  current.max = Math.max(current.max, durationMs);
  metrics.set(key, current);
}

/** Ejecuta `fn` midiendo su duración, sin alterar el resultado ni tragarse errores. */
export async function withTiming<T>(
  name: string,
  fn: () => Promise<T>,
  labels: Record<string, string> = {}
): Promise<T> {
  const startedAt = process.hrtime.bigint();
  try {
    return await fn();
  } finally {
    recordTiming(name, Number(process.hrtime.bigint() - startedAt) / 1_000_000, labels);
  }
}

/** Snapshot serializable de las métricas, expuesto en `GET /health`. */
export function snapshotMetrics(): Array<{
  name: string;
  kind: MetricKind;
  labels: Record<string, string>;
  count: number;
  sum: number;
  max: number;
  avg: number;
}> {
  return [...metrics.entries()].map(([key, entry]) => ({
    name: key,
    kind: entry.kind,
    labels: entry.labels,
    count: entry.count,
    sum: entry.sum,
    max: entry.max,
    avg: entry.count > 0 ? entry.sum / entry.count : 0,
  }));
}

function prometheusLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined && value !== '');
  if (entries.length === 0) return '';
  const body = entries
    .map(([key, value]) => `${key}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');
  return `{${body}}`;
}

/**
 * Serializa las métricas en formato de texto Prometheus 0.0.4.
 * Los contadores se exportan como `<name>` y los timings desagregados en
 * `_count`, `_sum`, `_avg` y `_max` para poder graficarlos sin dependencias.
 */
export function toPrometheusText(
  snapshot: ReturnType<typeof snapshotMetrics> = snapshotMetrics(),
  extraGauges: Record<string, number> = {}
): string {
  const lines: string[] = [];

  for (const metric of snapshot) {
    const baseName = metric.name.split('{')[0].replace(/[^a-zA-Z0-9_:]/g, '_');
    const labels = prometheusLabels(metric.labels);

    if (metric.kind === 'counter') {
      lines.push(`${baseName}${labels} ${metric.count}`);
      continue;
    }

    lines.push(`${baseName}_count${labels} ${metric.count}`);
    lines.push(`${baseName}_sum${labels} ${metric.sum}`);
    lines.push(`${baseName}_avg${labels} ${metric.avg}`);
    lines.push(`${baseName}_max${labels} ${metric.max}`);
  }

  for (const [name, value] of Object.entries(extraGauges)) {
    if (!Number.isFinite(value)) continue;
    lines.push(`${name.replace(/[^a-zA-Z0-9_:]/g, '_')} ${value}`);
  }

  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

/** Solo para pruebas: reinicia contadores y cache de loggers. */
export function resetObservability(): void {
  metrics.clear();
  cache.clear();
}

/**
 * Redacta un valor arbitrario para respuestas HTTP o mensajes al usuario.
 * Se usa cuando una ruta necesita devolver detalles pero sin PHI.
 */
export function safeErrorMessage(error: unknown, fallback = 'Error interno del servidor'): string {
  if (process.env.NODE_ENV === 'production') return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

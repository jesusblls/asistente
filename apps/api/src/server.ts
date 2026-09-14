import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import formBody from '@fastify/formbody';
import fastifyWebSocket from '@fastify/websocket';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import {
  incrementCounter,
  recordTiming,
  snapshotMetrics,
  toPrometheusText,
} from '@asistente/observability';
import { registerAuth } from './lib/auth.js';
import { registerErrorHandler, registerRawJsonBody } from './lib/http.js';
import { jobQueue, startQueueWorker } from './services/queue/handlers.js';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhooks.js';
import { voiceRoutes } from './routes/voice.js';
import { adminRoutes } from './routes/admin.js';

export interface BuildServerOptions {
  logger?: boolean | Record<string, unknown>;
  /**
   * Arranca el worker de la cola dentro del proceso del servidor.
   * En producción lo hace el entrypoint (`index.ts`); las pruebas E2E que
   * ejercitan webhooks a través de `app.inject` pueden activarlo aquí.
   */
  startQueueWorker?: boolean;
}

function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (raw) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGINS es obligatorio en producción (lista separada por comas)');
  }

  return ['http://localhost:3001', 'http://127.0.0.1:3001'];
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const server = fastify({
    logger:
      options.logger === undefined
        ? {
            level: process.env.LOG_LEVEL || 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          }
        : options.logger,
    bodyLimit: Number(process.env.BODY_LIMIT_BYTES || 1024 * 1024),
  });

  registerErrorHandler(server);
  registerRawJsonBody(server);

  // Métricas HTTP mínimas en proceso (contadores + histograma simple).
  const requestStartedAt = new WeakMap<object, bigint>();
  server.addHook('onRequest', async (request) => {
    requestStartedAt.set(request, process.hrtime.bigint());
  });
  server.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStartedAt.get(request);
    const durationMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1_000_000 : 0;
    const route = request.routeOptions?.url || request.url;
    incrementCounter('http_requests_total', {
      method: request.method,
      route,
      status: String(reply.statusCode),
    });
    recordTiming('http_request_duration_ms', durationMs, { route });
  });
  server.addHook('onError', async (request, _reply, error) => {
    incrementCounter('http_errors_total', {
      route: request.routeOptions?.url || request.url,
      code: String(error.statusCode || 500),
    });
  });

  await server.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  });
  await server.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    timeWindow: '1 minute',
  });
  await server.register(cors, { origin: resolveCorsOrigins() });
  await server.register(formBody);
  await server.register(fastifyWebSocket);

  await registerAuth(server);
  await server.register(authRoutes);

  server.get('/health', async () => {
    // La salud incluye la profundidad de la cola: si se acumulan trabajos
    // PENDING/DEAD es señal de que el worker no está corriendo o de que un
    // proveedor externo está fallando. Nunca expone datos de pacientes.
    let queue: Record<string, number> | { error: string };
    try {
      queue = await jobQueue.stats();
    } catch {
      queue = { error: 'unavailable' };
    }

    return {
      status: 'ok',
      service: 'asistente-omnicanal-api',
      timestamp: new Date().toISOString(),
      country: 'Mexico (+52)',
      channels: ['WhatsApp', 'Instagram', 'Messenger', 'Twilio Voice', 'Webchat'],
      queue,
      queueWorker: process.env.QUEUE_WORKER_ENABLED === 'false' ? 'disabled' : 'enabled',
      metrics: snapshotMetrics().slice(0, 40),
    };
  });

  /**
   * Métricas protegidas por token. Sin `METRICS_TOKEN` solo se exponen en
   * desarrollo; en producción responden 404 para no filtrar información.
   */
  server.get('/metrics', async (request, reply) => {
    const expectedToken = process.env.METRICS_TOKEN;
    const providedToken = request.headers['x-metrics-token'];

    if (!expectedToken) {
      if (process.env.NODE_ENV === 'production') {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.send({
        warning: 'METRICS_TOKEN no configurado (solo desarrollo)',
        metrics: snapshotMetrics(),
      });
    }

    if (providedToken !== expectedToken) {
      return reply.status(401).send({ error: 'No autorizado' });
    }

    let queue: Record<string, number> | { error: string };
    try {
      queue = await jobQueue.stats();
    } catch {
      queue = { error: 'unavailable' };
    }

    return reply.send({ metrics: snapshotMetrics(), queue });
  });

  /**
   * Mismo control de acceso que `/metrics`, en formato Prometheus 0.0.4.
   */
  server.get('/metrics/prometheus', async (request, reply) => {
    const expectedToken = process.env.METRICS_TOKEN;
    const providedToken = request.headers['x-metrics-token'];

    if (!expectedToken) {
      if (process.env.NODE_ENV === 'production') {
        return reply.status(404).send({ error: 'Not found' });
      }
    } else if (providedToken !== expectedToken) {
      return reply.status(401).send({ error: 'No autorizado' });
    }

    const gauges: Record<string, number> = {};
    try {
      const queueStats = await jobQueue.stats();
      for (const [key, value] of Object.entries(queueStats)) {
        gauges[`queue_${key.toLowerCase()}`] = value;
      }
    } catch {
      gauges.queue_unavailable = 1;
    }

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return reply.send(toPrometheusText(snapshotMetrics(), gauges));
  });

  await server.register(webhookRoutes);
  await server.register(voiceRoutes);
  await server.register(adminRoutes);

  if (options.startQueueWorker) {
    startQueueWorker();
    server.addHook('onClose', async () => {
      await jobQueue.stop();
    });
  }

  return server;
}

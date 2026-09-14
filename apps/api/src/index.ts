import 'dotenv/config';
import { buildServer } from './server.js';
import { jobQueue, startQueueWorker } from './services/queue/handlers.js';

async function main() {
  const server = await buildServer();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '0.0.0.0';

  try {
    const address = await server.listen({ port, host });

    // Worker in-process de la cola de webhooks/outbox. En producción conviene
    // poder escalarlo aparte (QUEUE_WORKER_ENABLED=false en las instancias web).
    if (process.env.QUEUE_WORKER_ENABLED !== 'false') {
      startQueueWorker();
    }

    server.log.info(`🚀 Servidor Asistente Omnicanal activo en: ${address}`);
    server.log.info(`📡 Webhook Meta: ${address}/webhooks/meta`);
    server.log.info(`📞 Webhook Twilio Voice: ${address}/voice/incoming`);
    server.log.info(`🎙️ WebSocket Voz Twilio: ws://${host}:${port}/voice/stream`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  // Apagado ordenado: se deja de aceptar tráfico, se termina el lote en curso
  // de la cola y solo entonces se cierra el proceso.
  const shutdown = async (signal: string) => {
    server.log.info(`Señal ${signal} recibida: cerrando ordenadamente`);
    try {
      await server.close();
      await jobQueue.stop();
    } catch (error) {
      server.log.error(error);
    }
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main();

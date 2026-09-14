import { FastifyInstance } from 'fastify';
import { createLogger } from '@asistente/observability';
import { VoiceStreamService } from '../services/voiceStreamService.js';

const logger = createLogger('api:voice-route');

export async function voiceRoutes(fastify: FastifyInstance) {
  /**
   * WebSocket para Twilio Media Streams (audio bidireccional en tiempo real).
   *
   * La autenticación real ocurre en el webhook `/voice/incoming`, que firma el
   * `tenantId` y (si `VOICE_STREAM_TOKEN` está definido) un token dentro del
   * TwiML; aquí se vuelven a validar antes de abrir el pipeline.
   */
  fastify.get('/voice/stream', { websocket: true }, (socket, request) => {
    logger.info('Cliente WebSocket conectado a /voice/stream', { requestId: request.id });
    try {
      VoiceStreamService.handleConnection(socket, { logger });
    } catch (error) {
      logger.error('No se pudo iniciar el pipeline de voz', error, { requestId: request.id });
      try {
        socket.close(1011, 'voice_init_failed');
      } catch {
        // El socket ya podría estar cerrado.
      }
    }
  });
}

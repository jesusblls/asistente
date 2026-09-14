/**
 * Contratos compartidos del pipeline de voz.
 *
 * El logger es estructural (compatible con `@asistente/observability` y con
 * cualquier logger tipo pino) para que los módulos de voz se puedan probar sin
 * arrastrar dependencias de infraestructura.
 */

export interface VoiceLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  child?(bindings: Record<string, unknown>): VoiceLogger;
}

/** Logger de descarte para pruebas y contextos donde no hay logging configurado. */
export const silentVoiceLogger: VoiceLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentVoiceLogger,
};

import type { FastifyRequest } from 'fastify';
import type { AuditActor } from '@asistente/database';

function requestTrace(request: FastifyRequest): Pick<AuditActor, 'ipAddress' | 'userAgent' | 'requestId'> {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: request.ip ?? null,
    userAgent: typeof userAgent === 'string' ? userAgent : null,
    requestId: String(request.id),
  };
}

/**
 * Actor de auditoría a partir de la sesión. El rol y el correo se copian al
 * momento del evento porque el usuario puede cambiar de rol o borrarse después.
 */
export function actorFromRequest(request: FastifyRequest): AuditActor {
  const user = request.authUser;
  if (!user) return { type: 'ANONYMOUS', ...requestTrace(request) };

  return {
    type: 'USER',
    id: user.userId,
    email: user.email,
    role: user.role,
    ...requestTrace(request),
  };
}

export function webhookActor(request: FastifyRequest, provider: string): AuditActor {
  return { type: 'WEBHOOK', id: provider, ...requestTrace(request) };
}

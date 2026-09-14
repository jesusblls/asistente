export { db, getPrismaClient } from './client.js';

export * from '@prisma/client';
export { hashPassword, verifyPassword, burnPasswordTiming } from './password.js';
export { decryptCredentials, encryptCredentials, isEncryptedCredential } from './credentials.js';
export { appointmentSlotKey } from './slotKey.js';
export {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_ENTITY_TYPES,
  diffChanges,
  recordAudit,
  type AuditAction,
  type AuditActor,
  type AuditActorType,
  type AuditChanges,
  type AuditEntityType,
  type AuditEntry,
} from './audit.js';

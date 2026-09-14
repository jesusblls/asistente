-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "patientId" TEXT,
    "changes" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_patientId_createdAt_idx" ON "AuditLog"("tenantId", "patientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_actorId_createdAt_idx" ON "AuditLog"("tenantId", "actorId", "createdAt");

-- ---------------------------------------------------------------------------
-- Inmutabilidad. Lo anterior lo generó `prisma migrate diff`; los triggers se
-- agregan a mano porque Prisma no puede expresarlos en schema.prisma.
-- ---------------------------------------------------------------------------

-- Solo inserción: ni un bug ni quien tenga acceso de escritura desde la
-- aplicación puede reescribir el rastro de un acceso.
CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'AuditLog es de solo inserción: no se permite modificar registros');
END;

-- Retención: el expediente clínico se conserva al menos 5 años
-- (NOM-004-SSA3-2012) y su rastro de accesos también. Se usan 1827 días
-- (5 años más dos bisiestos) para no permitir nunca un borrado anticipado.
-- `createdAt` se guarda como epoch en milisegundos; si alguna fila llegara con
-- texto, SQLite lo considera mayor que cualquier número y el borrado se
-- bloquea: la falla queda del lado seguro.
CREATE TRIGGER "AuditLog_retention_delete"
BEFORE DELETE ON "AuditLog"
WHEN OLD."createdAt" > (CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 157852800000)
BEGIN
  SELECT RAISE(ABORT, 'AuditLog: no se pueden borrar registros con menos de 5 años de antigüedad');
END;


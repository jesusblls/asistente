-- ---------------------------------------------------------------------------
-- Recuperación de contraseña.
--
-- Hasta aquí, quien olvidaba su contraseña no tenía forma de volver a entrar
-- sin que alguien le cambiara el hash a mano en la base.
-- ---------------------------------------------------------------------------

-- Sesiones emitidas antes de este instante dejan de valer (ver lib/auth.ts).
ALTER TABLE "User" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);

-- Enlaces de un solo uso. Solo se guarda el SHA-256 del token.
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");

ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

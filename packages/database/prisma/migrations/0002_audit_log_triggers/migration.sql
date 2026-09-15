-- ---------------------------------------------------------------------------
-- Inmutabilidad de AuditLog (LFPDPPP / NOM-024-SSA3). Prisma no puede
-- expresar triggers en schema.prisma, así que se agregan a mano. Reescrito
-- de PL/SQLite a PL/pgSQL en la migración a PostgreSQL: Postgres exige una
-- función separada por trigger (no admite el cuerpo inline de SQLite) y
-- `FOR EACH ROW` explícito.
-- ---------------------------------------------------------------------------

-- Solo inserción: ni un bug ni quien tenga acceso de escritura desde la
-- aplicación puede reescribir el rastro de un acceso.
CREATE FUNCTION audit_log_no_update() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog es de solo inserción: no se permite modificar registros';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update"
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION audit_log_no_update();

-- Retención: el expediente clínico se conserva al menos 5 años
-- (NOM-004-SSA3-2012) y su rastro de accesos también. Se usan 1827 días
-- (5 años más dos bisiestos) para no permitir nunca un borrado anticipado.
-- A diferencia de SQLite (donde `createdAt` vivía como epoch en milisegundos
-- y la comparación era aritmética entera), en Postgres es un TIMESTAMP nativo
-- y la comparación usa aritmética de intervalos real.
CREATE FUNCTION audit_log_retention_delete() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."createdAt" > NOW() - INTERVAL '1827 days' THEN
    RAISE EXCEPTION 'AuditLog: no se pueden borrar registros con menos de 5 años de antigüedad';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_retention_delete"
BEFORE DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION audit_log_retention_delete();

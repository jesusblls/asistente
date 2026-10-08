/**
 * Administradores de plataforma: el equipo que opera AsistentePro, no el
 * personal de una clínica. Se definen por correo en `PLATFORM_ADMIN_EMAILS`.
 *
 * Solo ellos pueden dar de alta clínicas y usar las herramientas de sandbox
 * (`+ Citas Demo`, `Limpiar`), que escriben o borran historial clínico en
 * bloque. Un ADMIN de clínica administra su clínica, no la plataforma.
 *
 * Sin lista configurada:
 *   - en producción nadie es administrador de plataforma (falla cerrado; la
 *     validación de arranque ya exige la variable);
 *   - en desarrollo cualquier ADMIN lo es, para que un clon recién levantado
 *     pueda crear clínicas y sembrar datos sin configurar nada.
 */
export function platformAdminAllowList(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(user: { email: string; role: string }): boolean {
  if (user.role !== 'ADMIN') return false;
  const allowList = platformAdminAllowList();
  if (allowList.length === 0) return process.env.NODE_ENV !== 'production';
  return allowList.includes(user.email.toLowerCase());
}

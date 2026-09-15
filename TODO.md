# Pendientes — AsistentePro Clínicas

Lista viva de lo que falta. Cada pendiente dice por qué importa, dónde está y de
qué cambio salió (el hash lleva a su entrada en [`BITACORA.md`](BITACORA.md)).

**Cómo usarla**

- Al **resolver** un pendiente, bórralo de aquí y regístralo en la bitácora como
  cualquier otro cambio ([CLAUDE.md § 7](CLAUDE.md)). El historial queda en git y
  en la bitácora; aquí solo vive lo abierto.
- Al **descubrir** uno nuevo, agrégalo en su prioridad y también en "Pendientes
  derivados" de la entrada de bitácora que lo originó.
- **Prioridad:** *Alta* bloquea producción o cumplimiento; *Media* es deuda con
  riesgo real; *Baja* es mejora.

---

## Alta — antes de producción

- [ ] **Migrar de SQLite a PostgreSQL y reescribir los triggers de `AuditLog`.**
  SQLite admite un solo escritor, y ese es el cuello de botella real bajo
  webhooks concurrentes y la cola de trabajos. Los dos triggers que hacen
  inmutable la bitácora (sin `UPDATE`, sin `DELETE` antes de 5 años) deben
  reescribirse en PL/pgSQL en la misma migración: Prisma no los genera y
  `migrate diff` no los detecta, así que la protección desaparecería sin aviso.
  `packages/database/prisma/migrations/0003_audit_log/` · origen: `402dfc4`, `052a205`

## Media

### Auditoría

- [ ] **El límite de lecturas de auditoría vive en memoria.** Con varias
  instancias de la API habría una fila por instancia en cada ventana de 10
  minutos. Moverlo a un almacén compartido (Redis / KV) cuando se escale a
  múltiples instancias horizontales.
  `packages/database/src/audit.ts` · origen: `052a205`

- [ ] **Decidir con asesoría legal si se auditan las escrituras que origina el
  paciente o el canal**: mensaje entrante, alta de paciente por WhatsApp o por
  voz. Hoy no se auditan por decisión, porque el propio registro es el rastro y
  no interviene ningún humano.
  origen: `052a205`

### Calidad de código

- [ ] **Partir los archivos-dios restantes en frontend:**
  - `apps/web/src/app/dashboard/inbox/page.tsx` (1191 líneas)
  - `apps/web/src/app/dashboard/calendar/page.tsx` (1003 líneas)

  *Nota:* `apps/api/src/routes/admin.ts` y `apps/web/src/app/dashboard/team/page.tsx`
  fueron exitosamente modularizados en submódulos y componentes dedicados.
  origen: `402dfc4`

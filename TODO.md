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

## Media

### Calidad de código

- [ ] **Partir los archivos-dios restantes en frontend:**
  - `apps/web/src/app/dashboard/inbox/page.tsx` (1191 líneas)
  - `apps/web/src/app/dashboard/calendar/page.tsx` (1003 líneas)

  *Nota:* `apps/api/src/routes/admin.ts` y `apps/web/src/app/dashboard/team/page.tsx`
  fueron exitosamente modularizados en submódulos y componentes dedicados.
  origen: `402dfc4`

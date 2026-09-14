---
version: 1
slug: "apps-web-src-app-dashboard-audit-page-tsx"
primary_target: "apps/web/src/app/dashboard/audit/page.tsx"
related_targets: []
---

# Surface brief: /dashboard/audit

**Scope and mode:** Bitácora de auditoría del panel de la clínica. Operate.

**Audience:** Dirección de la clínica (rol ADMIN en modo En Vivo; cualquiera en modo Demo, como argumento de venta de cumplimiento).

**Job:** Responder "¿quién vio o modificó este expediente?" ante una solicitud ARCO, una queja o la baja de un empleado, y detectar lo sensible (logins fallidos, borrados, pagos marcados a mano, accesos fuera de horario). Uso ocasional y reactivo, no de monitoreo continuo.

**Actions:** filtrar por periodo, tipo y empleado; pivotar a un paciente o empleado; ver el diff de cada cambio; exportar CSV auditado desde el servidor.

**Constraints:** horas siempre en America/Mexico_City; en vivo nunca se inventan eventos; en demo ninguna vista queda vacía; consultar y exportar también quedan auditados; sin polling (cada consulta genera una fila).

## Direction contract

THESIS: La bitácora responde una pregunta en una frase humana por evento; rechaza la tabla cruda de columnas estilo visor de logs.

OWN-WORLD: El panel existente sin cambios: lienzo slate-100, superficies blancas con borde slate-200, teal-600 solo para acción y selección, ámbar y rojo reservados a lo sensible, Plus Jakarta Sans, cifras tabulares.

STORY: El director ve la actividad de la clínica agrupada por día, toca un paciente o un empleado y la vista se convierte en su expediente de accesos; si un auditor lo pide, exporta exactamente lo filtrado.

FIRST VIEWPORT: Encabezado con título, pastilla de modo y exportar; barra de filtros (periodo, tipo, empleado, solo sensibles); feed por día con hora, avatar del actor y frase. Al pivotar, una franja del expediente sobre el feed dice en una frase cuántas personas accedieron y quiénes. Firma: ese pivote.

FORM: Extensión del panel establecido; petición acotada, sin concept-seed (seed: n/a).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

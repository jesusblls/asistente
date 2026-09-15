# DESIGN.md — Sistema de Diseño Clínico Impeccable
> **Especificación Canónica de Identidad Visual, Tokens, Componentes y Accesibilidad para AsistentePro Clínicas**

---

## 1. Filosofía de Diseño

El sistema visual de **AsistentePro Clínicas** está diseñado específicamente para entornos de salud en México (consultorios médicos, clínicas dentales, centros de especialidades). Sigue los principios del estándar **Impeccable**:

1. **Rigor Clínico sobre Adornos Digitales:**
   - La interfaz proyecta seriedad, higiene visual y alta confianza institucional.
   - Se evitan explícitamente clichés comunes de software de IA: sin gradientes estridentes, sin morados/violetas genéricos, sin efectos holográficos o decoraciones innecesarias que resten credibilidad a un expediente o agenda médica.
2. **Claridad Inmediata bajo Presión:**
   - Los recepcionistas y médicos toman decisiones en segundos entre consultas presenciales y llamadas entrantes. La tipografía, los contrastes y la jerarquía de información priorizan el escaneo visual ultrarrápido.
3. **Control Humano Evidente:**
   - La automatización de la IA siempre tiene un estado visual transparente: los pacientes atendidos por IA, las citas confirmadas y las conversaciones intervenidas manualmente (*Takeover*) tienen códigos de color e insignias inconfundibles.

---

## 2. Paleta de Colores y Tokens

El sistema se basa en una escala monocromática sobria (*Slate*) combinada con un acento clínico verde azulado (*Medical Teal*) y códigos semánticos universales.

### 2.1 Colores Principales

| Token | Hex | Clase Tailwind | Uso Principal |
| :--- | :--- | :--- | :--- |
| **Brand 50** | `#f0fdfa` | `bg-teal-50` | Fondos de avatares, alertas activas y acentos suaves |
| **Brand 100** | `#ccfbf1` | `bg-teal-100` | Badges de éxito y bordes sutiles |
| **Brand 500** | `#14b8a6` | `text-teal-500` | Iconos secundarios y focos activos |
| **Brand 600** | `#0d9488` | `bg-teal-600` | Botón de acción principal (CTA), acento de marca |
| **Brand 700** | `#0f766e` | `hover:bg-teal-700` | Estados hover de botones primarios |
| **Brand 900** | `#134e4a` | `text-teal-900` | Textos de acento de alto contraste |

### 2.2 Escala Neutra (Slate)

| Token | Hex | Clase Tailwind | Uso Principal |
| :--- | :--- | :--- | :--- |
| **Slate 50** | `#f8fafc` | `bg-slate-50` | Fondo general de la aplicación, pies de página de modales |
| **Slate 100** | `#f1f5f9` | `bg-slate-100` | Fondos de controles secundarios, cabeceras de tablas |
| **Slate 200** | `#e2e8f0` | `border-slate-200` | Bordes de tarjetas, divisores estructurales e inputs |
| **Slate 400** | `#94a3b8` | `text-slate-400` | Placeholders, iconos terciarios |
| **Slate 500** | `#64748b` | `text-slate-500` | Metadatos, subtítulos y texto secundario |
| **Slate 700** | `#334155` | `text-slate-700` | Etiquetas de formularios y encabezados de listas |
| **Slate 900** | `#0f172a` | `text-slate-900` | Títulos principales, texto de alta jerarquía |

### 2.3 Señalización Semántica

| Estado / Dominio | Fondo Suave | Borde | Texto / Icono | Significado Clínico |
| :--- | :--- | :--- | :--- | :--- |
| **Confirmado / Pagado** | `bg-emerald-50` | `border-emerald-200` | `text-emerald-700` | Cita confirmada, anticipo acreditado en Mercado Pago |
| **Pendiente / En Espera** | `bg-amber-50` | `border-amber-200` | `text-amber-700` | Anticipo pendiente, cita sin confirmar |
| **Urgencia / Cancelado** | `bg-red-50` | `border-red-200` | `text-red-700` | Dolor agudo, sospecha de emergencia, cancelación |
| **Modo Humano (Copiloto)** | `bg-indigo-50` | `border-indigo-200` | `text-indigo-700` | Intervención manual activa (*Takeover*), IA en pausa |
| **Canal WhatsApp** | `bg-emerald-50` | `border-emerald-200` | `text-emerald-600` | Mensajería oficial Meta Cloud API |
| **Canal Teléfono** | `bg-sky-50` | `border-sky-200` | `text-sky-600` | Llamada de voz entrante vía Twilio Voice |

---

## 3. Tipografía y Jerarquía

El monorepo utiliza la pila nativa de fuentes del sistema operativo para una carga instantánea (0 ms layout shift) y máxima nitidez en pantallas Retina y de alta densidad:
`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`.

### Escala de Texto

```
24px / 32px (text-2xl font-bold)     ➔ Títulos principales de pantalla (Panel, Bandeja, Agenda)
18px / 28px (text-lg font-bold)      ➔ Títulos de tarjeta métrica, subtítulos destacados
16px / 24px (text-base font-semibold) ➔ Encabezados de tabla, títulos de modales
14px / 20px (text-sm font-medium)    ➔ Texto de cuerpo, filas de tabla, valores de formulario
12px / 16px (text-xs font-medium)    ➔ Badges de estado, metadatos, fechas relativas
10px / 14px (text-[10px] uppercase)  ➔ Micro-etiquetas, identificadores de canal
```

---

## 4. Radios de Borde, Elevaciones y Espaciados

### 4.1 Radios de Borde (`border-radius`)
- **`rounded-lg` (8px):** Inputs de formulario, botones de acción, selects.
- **`rounded-xl` (12px):** Tarjetas de métricas, contenedores internos de chat, alertas.
- **`rounded-2xl` (16px):** Tarjetas principales del dashboard, paneles laterales, modales.
- **`rounded-full` (9999px):** Badges de estado, chips de turno, avatares de usuario.

### 4.2 Elevaciones y Sombras (`box-shadow`)
- **`shadow-xs` / `shadow-sm`:** Tarjetas y contenedores estándar en superficie clara.
- **`shadow-md`:** Estados hover de tarjetas interactivas y botones secundarios.
- **`shadow-2xl`:** Modales superpuestos con backdrop difuminado (`backdrop-blur-xs`).

### 4.3 Espaciados y Retícula
- Malla basada en múltiplos de 4px (`p-1` = 4px, `p-2` = 8px, `p-3` = 12px, `p-4` = 16px, `p-6` = 24px, `p-8` = 32px).
- Separaciones estándar entre bloques de contenido: `space-y-6` o `gap-6`.

---

## 5. Biblioteca de Componentes Base

### 5.1 Shell y Encabezado (`DashboardShell`)
- Barra superior sticky con identificador de clínica activa, selector multi-tenant, toggle dual **En Vivo / Modo Demo** e indicador del rol del usuario (`ADMIN`, `RECEPTIONIST`, `DOCTOR`).
- Navegación lateral persistente con iconos Lucide unificados y badge de citas de hoy.

### 5.2 Tarjetas Métricas (`MetricCard`)
- Estructura: Icono en caja tonal suave (`w-10 h-10 rounded-xl`), título en `text-xs text-slate-500`, valor grande en `text-2xl font-bold text-slate-900`, y píldora de variación porcentual o indicador de actividad.

### 5.3 Bandeja Omnicanal en Vivo (`Inbox`)
- **Lista de Conversaciones:** Indicador de canal (WhatsApp vs Teléfono), nombre del paciente, último mensaje con truncado elíptico, fecha localizada en CDMX y badge de estado.
- **Ventana de Chat:** Mensajes del paciente alineados a la izquierda (`bg-slate-100 text-slate-800`); respuestas de la IA a la derecha con badge `Asistente IA` (`bg-teal-600 text-white`); intervenciones del personal con prefijo `[Nombre Personal]` (`bg-slate-900 text-white`).
- **Banner de Takeover:** Barra de advertencia destacada en azul índigo (`bg-indigo-50 border-indigo-200 text-indigo-900`) cuando la IA está pausada para intervención humana.
- **Ficha del Paciente:** Panel lateral colapsable con datos de contacto E.164, historial de citas y accesos rápidos para confirmar o cancelar.

### 5.4 Modales de Diálogo (`ModalDialog`)
- Fondo: `fixed inset-0 bg-slate-900/40 backdrop-blur-xs`.
- Entrada animada: `animate-in fade-in zoom-in-95 duration-150`.
- Cabecera: Icono temático en círculo de color, título descriptivo y botón de cerrar (`X`).
- Pie de acciones: Separado por borde sutil (`bg-slate-50 border-t border-slate-100`), botón cancelar a la izquierda/centro y botón de confirmación destacado a la derecha.

---

## 6. Reglas de Accesibilidad (a11y) y Estándar NOM-024

1. **Ratio de Contraste:** Todos los textos principales cumplen con una relación de contraste mínima de **4.5:1** contra sus fondos (cumplimiento estricto WCAG 2.1 AA).
2. **Anillos de Foco Visibles:** Todos los campos de entrada y botones interactivos disponen de estados de foco nítidos: `focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500`.
3. **Iconografía Accesible:** Todo icono decorativo cuenta con `aria-hidden="true"`; los botones basados solo en iconos disponen de `aria-label` descriptivo en español.
4. **Respeto a Preferencias del Sistema:** El sistema desactiva animaciones y transiciones complejas cuando el usuario activa `prefers-reduced-motion: reduce`.
5. **Privacidad y Datos Clínicos:** Toda exportación o visualización de números de teléfono se presenta en formato enmascarado o canónico para cumplir con la NOM-024-SSA3-2012 y la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).

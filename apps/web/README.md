# @asistente/web

Frontend de la plataforma AsistentePro Clínicas construido con Next.js 15 (App Router), React 19, Tailwind CSS y Lucide React.

## 🌐 Puerto y Ejecución
- **Puerto de desarrollo:** `3001`
- **Comando:** `npm run dev --workspace=@asistente/web`

## 📱 Páginas y Vistas (`src/app/`)
- **`/` (Landing Page):** Conversión comercial con simulador interactivo de llamadas de voz y chat de WhatsApp en vivo, calculadora de ROI, testimonios clínicos y planes de suscripción.
- **`/dashboard`:** Visión general de KPIs de la clínica (ingresos acumulados en MXN, porcentaje de asistencia, citas del día, reproductor de llamadas de Twilio y badges de No-Show Shield).
- **`/dashboard/inbox`:** Bandeja omnicanal unificada en tiempo real con selector de paciente, historial de chat, botón de toma de control (*Takeover* para pausar la IA) y respuesta manual.
- **`/dashboard/calendar`:** Calendario interactivo con filtros por especialista y estado de citas.
- **`/dashboard/team`:** Gestión de doctores y catálogo de procedimientos con duración, costo y anticipo obligatorio en MXN.
- **`/dashboard/settings`:** Parámetros de clínica, teléfono E.164, mensaje de bienvenida y protocolo de emergencias.

## 🎛️ Estado Global y Dualidad (`src/context/TenantContext.tsx`)
- **Modo Demo (Showcase Comercial):** Datos de alta fidelidad preconfigurados ("Clínica Dental Sonrisas Polanco") ideales para demostraciones en vivo a médicos.
- **Modo En Vivo (Sandbox Operativo):** Conectado en tiempo real a la API Fastify (`http://localhost:3000`) y la base de datos SQLite (`dev.db`). Permite crear clínicas, generar citas de prueba (`+ Citas Demo`) o resetearlas (`Limpiar Citas`).

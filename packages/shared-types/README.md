# @asistente/shared-types

Paquete de definiciones de TypeScript canónicas compartidas por todos los workspaces del monorepo `asistente`.

## 📦 Exportaciones Principales (`src/index.ts`)

### Enums y Tipos Literales
- **`ChannelType`:** `'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'PHONE_CALL' | 'WEBCHAT'`
- **`AppointmentStatus`:** `'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'COMPLETED' | 'NO_SHOW'`
- **`PaymentStatus`:** `'NONE' | 'DEPOSIT_PENDING' | 'DEPOSIT_PAID' | 'FULLY_PAID' | 'REFUNDED'`
- **`MessageDirection`:** `'INBOUND' | 'OUTBOUND'`
- **`MessageSenderRole`:** `'PATIENT' | 'AI_AGENT' | 'HUMAN_STAFF' | 'SYSTEM'`

### Interfaces de Entidades
- **`Tenant`:** Entidad clínica multi-tenant con slug, teléfono E.164, dirección y bienvenida.
- **`Doctor` & `DoctorAvailabilityRules`:** Especialista y configuración de turnos semanales, comidas y buffers.
- **`Service`:** Procedimiento médico con precio y anticipo en MXN, duración en minutos.
- **`Patient`:** Paciente con teléfono normalizado E.164 (`+52...`), IDs sociales y notas.
- **`Appointment`:** Cita con doctor, servicio, horarios UTC, estatus y control de anticipo No-Show.
- **`Conversation` & `Message`:** Hilos de mensajería omnicanal con control de Takeover humano.
- **`TimeSlot`:** Ranura de agenda calculada para presentación y reserva.
- **`ChannelCredentials`:** Credenciales de WhatsApp Cloud API, Twilio Voice, Mercado Pago, etc.

## 🛠️ Comandos
```bash
npm run build --workspace=@asistente/shared-types
```

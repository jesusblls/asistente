# @asistente/database

Capa de persistencia con Prisma ORM y SQLite (`dev.db`), diseñada para aislamiento multi-tenant estricto y compatible con PostgreSQL para entornos de producción.

## 🗄️ Esquema Relacional (`prisma/schema.prisma`)

El modelo contiene 10 entidades:
1. **`Tenant`:** Consultorio o clínica SaaS. Clave primaria `id`, clave única `slug`.
2. **`User`:** Administradores, recepcionistas y doctores con rol y hash de contraseña. Clave única `@@unique([tenantId, email])`.
3. **`Doctor`:** Médicos adscritos a la clínica con `availabilityRules` (JSON de horarios).
4. **`Service`:** Catálogo de tratamientos con duración en minutos, `priceMxn` y `requiredDepositMxn`.
5. **`Patient`:** Directorio de pacientes. Clave única `@@unique([tenantId, phoneE164])`.
6. **`Appointment`:** Citas agendadas con doctor, servicio y control de anticipo Mercado Pago (`paymentStatus`).
7. **`Conversation`:** Sesiones de chat omnicanal con paciente. Clave única `@@unique([tenantId, channel, externalChannelId])` y flag `isHandedOverToHuman`.
8. **`Message`:** Historial de mensajes entrantes y salientes vinculados a `Conversation`.
9. **`ChannelConfig`:** Credenciales de WhatsApp, Twilio o Mercado Pago por clínica.
10. **`FaqItem`:** Banco de preguntas frecuentes para respuestas rápidas de IA.

## 🚀 Uso en Código
```typescript
import { db } from '@asistente/database';

// Ejemplo de consulta segura con aislamiento multi-tenant:
const appointments = await db.appointment.findMany({
  where: { tenantId: 'id-de-la-clinica' },
  include: { patient: true, doctor: true, service: true },
});
```

## 🛠️ Comandos de Prisma
```bash
# Generar cliente de Prisma tras modificar schema.prisma
npm run generate --workspace=@asistente/database

# Sincronizar esquema con la base de datos dev.db
npm run push --workspace=@asistente/database

# Ejecutar seed con clínica modelo de Polanco (CDMX)
npm run seed --workspace=@asistente/database
```

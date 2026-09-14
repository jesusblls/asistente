# @asistente/ai-agent

Motor conversacional, agendamiento de citas, triaje médico/dental y pasarela de cobro de anticipos para México (+52).

## 🧠 Módulos Principales

### 1. `OmnichannelAgent` (`src/agent/geminiAgent.ts`)
- **Procesamiento Híbrido:** Conecta con **Google Gemini 2.5 Flash** mediante Function Calling (8 herramientas). Si no hay API key o hay error de red, activa el **motor heurístico local de 13 intenciones** garantizando 100% de disponibilidad.
- **Detección de Emergencias:** Filtro previo que canaliza emergencias vitales al 911 o urgencias hospitalarias antes de cualquier interacción.

### 2. `SchedulerService` (`src/calendar/scheduler.ts`)
- **`getAvailableSlots()`:** Calcula slots disponibles para una clínica y fecha en `America/Mexico_City`, respetando horarios de comida, turnos y buffer de 10 minutos entre pacientes.
- **`bookAppointment()`:** Valida en tiempo real que no existan colisiones de horario para el doctor (`status !== 'CANCELLED'`), crea o actualiza al paciente bajo clave compuesta `[tenantId, phoneE164]`, y genera la cita en estado `CONFIRMED`.

### 3. `evaluateTriage` (`src/triage/triageEngine.ts`)
- Clasifica síntomas en 3 niveles:
  - **`CRITICAL_EMERGENCY`:** Riesgo vital (ahogamiento, fractura mandíbula, hemorragia abundante). Alerta hospitalaria / 911.
  - **`URGENT_DENTAL`:** Dolor agudo insoportable (escala ≥ 7), traumatismo o absceso. Canalización prioritaria para el mismo día.
  - **`ROUTINE`:** Consulta preventiva o estética estándar.

### 4. `MercadoPagoService` (`src/payment/mercadoPagoService.ts`)
- **`createDepositPreference()`:** Genera preferencia de cobro de anticipo en MXN y link de Mercado Pago (`DEPOSIT_PENDING`).
- **`processPaymentWebhook()`:** Procesa la notificación IPN de Mercado Pago y actualiza la cita a `DEPOSIT_PAID` (Escudo Anti-Inasistencias).

### 5. Normalización Telefónica (`src/utils/phone.ts`)
- **`normalizeMexicanPhone()`:** Convierte cualquier entrada a formato canónico E.164 `+52XXXXXXXXXX` (gestiona prefijos `521`, `044`, `045` y 10 dígitos nacionales).
- **`formatMexicanPhoneDisplay()`:** Formatea para interfaces a `+52 (XX) XXXX-XXXX`.

## 🧪 Pruebas de QA
```bash
# Suite unitaria del agente y normalización
npx tsx src/test-suite.ts

# Suite exhaustiva de estrés E2E
npx tsx src/stress-test-suite.ts
```

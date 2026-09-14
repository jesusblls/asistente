# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide React

## Users
Clínicas privadas, consultorios médicos, consultorios dentales y especialistas en México.
- **Personal de Recepción:** Requiere desahogar el volumen abrumador de llamadas telefónicas y mensajes de WhatsApp repetitivos (precios, horarios, ubicación), concentrándose en la atención presencial de los pacientes en sala de espera.
- **Médicos y Directores de Clínica:** Buscan llenar huecos de agenda, eliminar hasta el 80% de inasistencias con anticipos y asegurar que ninguna llamada de un paciente potencial se pierda fuera de horario o en líneas ocupadas.
- **Pacientes (Usuarios Finales):** Buscan agendar o resolver dudas en menos de 60 segundos sin esperar en conmutadores telefónicos, con trato cálido, respetuoso y seguimiento claro por WhatsApp.

## Product Purpose
Plataforma de recepción y agendamiento omnicanal impulsada por Inteligencia Artificial que atiende llamadas telefónicas con voz natural (<600ms) y mensajes (WhatsApp, Instagram, Messenger) 24/7 en México (+52), realizando triaje clínico, sincronización de agenda y cobro de anticipos por Mercado Pago.

## Positioning
A diferencia de los chatbots rígidos tradicionales o las soluciones extranjeras que no entienden modismos ni telefonía local, AsistentePro está optimizado 100% para México: integración directa con números locales +52 (CDMX, MTY, GDL), lenguaje cálido y empático, triaje médico/dental con detección de urgencias vitales (911) y pasarela de anticipos con Mercado Pago (SPEI, tarjeta, OXXO).

## Operating Context
- Clínicas y consultorios con recepción física activa.
- Pacientes en situaciones cotidianas o de dolor agudo que exigen rapidez y calidez.
- Canales activos: Llamadas entrantes vía Twilio Media Streams, WhatsApp Cloud API oficial de Meta y panel web para el personal de la clínica.

## Capabilities and Constraints
- Recepción de llamadas en tiempo real con latencia sub-600ms e interrupción natural (*barge-in*).
- Mensajería automatizada y confirmaciones interactivas por WhatsApp con botones oficiales.
- Triaje inteligente: clasificación de severidad y derivación inmediata a urgencias o especialistas adecuados.
- Sincronización bidireccional de agenda médica (Google Calendar / DB local) con cálculo de buffers entre consultas.
- Escudo Anti-Inasistencias (*No-Show Shield*) con recaudación de anticipos en MXN.
- Modo Copiloto: botón de toma de control (*takeover*) para pausar la IA y responder manualmente con un clic.

## Brand Commitments
- **Nombre:** AsistentePro Clínicas (marca SaaS) y Clínica Dental Sonrisas Polanco (tenant demo).
- **Voz y Tono:** Profesional, educada, empática y de alta cortesía mexicana ("con mucho gusto", "un momento por favor", "para servirle").
- **Identidad Visual:** Limpia, de alta confianza médica, moderna pero sobria, alejada de clichés de IA (sin textos con degradados estridentes, sin morados/púrpuras genéricos, con contrastes nítidos y tipografía legible).

## Evidence on Hand
- Aplicación web activa en `http://localhost:3001` con simulador interactivo de llamadas y WhatsApp.
- Backend Fastify con WebSockets y webhooks en `http://localhost:3000`.
- Base de datos Prisma con modelo multi-tenant, doctores, servicios y citas pobladas.
- Test suites automatizados pasando al 100% (12 tests de agente + 7 tests de API).

## Product Principles
1. **La empatía clínica antecede a la venta:** En salud, la calidez y la comprensión del síntoma o molestia del paciente siempre están antes que el trámite comercial.
2. **Cero fricción en el contexto mexicano (+52):** Manejo nativo de números telefónicos de 10 dígitos, moneda nacional (MXN), zonas horarias locales y métodos de pago habituales como SPEI y Mercado Pago.
3. **El personal de salud siempre conserva el timón:** La IA es un copiloto incansable; los médicos y recepcionistas pueden supervisar, auditar y pausar la automatización en cualquier instante.
4. **Diseño de alta confianza médica sobre adorno digital:** La interfaz debe proyectar rigor clínico, claridad y accesibilidad, descartando elementos visuales superficiales que resten seriedad.

## Accessibility & Inclusion
- Cumplimiento de contraste WCAG AA para todos los textos y elementos interactivos.
- Legibilidad impecable en dispositivos móviles para pacientes y recepcionistas.
- Comunicación clara y accesible, sin jerga técnica que fatigue al usuario.

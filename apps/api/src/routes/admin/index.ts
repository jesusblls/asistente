import { FastifyInstance } from 'fastify';
import { tenantRoutes } from './tenants.js';
import { doctorRoutes } from './doctors.js';
import { serviceRoutes } from './services.js';
import { appointmentRoutes } from './appointments.js';
import { conversationRoutes } from './conversations.js';
import { patientRoutes } from './patients.js';
import { faqRoutes } from './faqs.js';
import { planRoutes } from './plan.js';
import { onboardingRoutes } from './onboarding.js';
import { auditRoutes } from './audit.js';

export async function adminPlugin(fastify: FastifyInstance) {
  // Todo el panel administrativo exige sesión válida.
  fastify.addHook('onRequest', fastify.authenticate);

  await fastify.register(tenantRoutes);
  await fastify.register(doctorRoutes);
  await fastify.register(serviceRoutes);
  await fastify.register(appointmentRoutes);
  await fastify.register(conversationRoutes);
  await fastify.register(patientRoutes);
  await fastify.register(faqRoutes);
  await fastify.register(planRoutes);
  await fastify.register(onboardingRoutes);
  await fastify.register(auditRoutes);
}

export * from './schemas.js';
export * from './common.js';
export { tenantRoutes } from './tenants.js';
export { doctorRoutes } from './doctors.js';
export { serviceRoutes } from './services.js';
export { appointmentRoutes } from './appointments.js';
export { conversationRoutes } from './conversations.js';
export { patientRoutes } from './patients.js';
export { faqRoutes } from './faqs.js';
export { planRoutes } from './plan.js';
export { onboardingRoutes } from './onboarding.js';
export { auditRoutes } from './audit.js';

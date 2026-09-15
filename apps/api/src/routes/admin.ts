import { FastifyInstance } from 'fastify';
import { adminPlugin } from './admin/index.js';

export async function adminRoutes(fastify: FastifyInstance) {
  await fastify.register(adminPlugin);
}

export * from './admin/index.js';

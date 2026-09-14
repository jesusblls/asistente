import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return prisma;
}

export const db = getPrismaClient();

export * from '@prisma/client';
export { hashPassword, verifyPassword, burnPasswordTiming } from './password.js';
export { appointmentSlotKey } from './slotKey.js';

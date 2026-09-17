// Sin esto, DATABASE_URL solo aparece por accidente: Prisma Client únicamente
// auto-carga variables de entorno cuando su propio dotenv interno localiza un
// .env, y ese comportamiento resultó ser inconsistente entre ejecutar este
// paquete ya compilado (import por nombre, resuelve a dist/) y ejecutarlo
// desde su código fuente vía tsx (import relativo, como hace seed.ts). En un
// clon nuevo, sin haber compilado nada todavía, `npm run db:seed` fallaba con
// "Environment variable not found: DATABASE_URL" pese a existir un .env en
// este mismo directorio — se confirmó reproduciendo ambos casos en un clon
// limpio. Cargar dotenv aquí explícitamente, en vez de confiar en ese
// comportamiento implícito, hace que sea robusto sin importar desde dónde ni
// cómo se invoque este paquete.
import 'dotenv/config';
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

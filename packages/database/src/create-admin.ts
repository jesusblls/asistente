import { getPrismaClient } from './index.js';
import { hashPassword } from './password.js';

const prisma = getPrismaClient();

/**
 * Bootstrap de un usuario administrador para una clínica existente.
 *
 * Uso:
 *   SEED_ADMIN_EMAIL=admin@clinica.mx SEED_ADMIN_PASSWORD=... TENANT_SLUG=dental-polanco \
 *   npx tsx packages/database/src/create-admin.ts
 * o vía script:
 *   SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... TENANT_SLUG=dental-polanco npm run admin:create
 */
async function main() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
  const slug = process.env.TENANT_SLUG || tenantArg?.split('=')[1] || 'dental-polanco';
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en el entorno para crear el administrador'
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Clínica no encontrada con slug "${slug}"`);

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase() } },
    update: { passwordHash, isActive: true, role: 'ADMIN' },
    create: {
      tenantId: tenant.id,
      email: email.toLowerCase(),
      name: 'Administrador',
      role: 'ADMIN',
      passwordHash,
    },
  });

  console.log(`✅ Administrador listo: ${user.email} (clínica ${tenant.name})`);
}

main()
  .catch((e) => {
    console.error('Error creando administrador:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { getPrismaClient } from './index.js';
import { hashPassword } from './password.js';
import { randomBytes } from 'node:crypto';

const prisma = getPrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de base de datos para clínica en México...');

  // 1. Crear o actualizar Tenant de demostración
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'dental-polanco' },
    update: {},
    create: {
      name: 'Clínica Dental Sonrisas Polanco',
      slug: 'dental-polanco',
      phoneE164: '+525555123456',
      timezone: 'America/Mexico_City',
      address: 'Av. Horacio 1520, Polanco, Miguel Hidalgo, 11550 Ciudad de México, CDMX',
      emergencyInstructions: 'En caso de traumatismo facial con hemorragia severa o dificultad respiratoria, acudir de inmediato al Hospital Español o comunicarse al 911.',
      welcomeMessage: '¡Hola! Bienvenido a Dental Sonrisas Polanco. Soy tu asistente virtual inteligente. ¿En qué te puedo ayudar hoy? Puedo agendar citas, consultar disponibilidad o responder dudas sobre nuestros tratamientos.',
      isActive: true,
    },
  });

  console.log(`✅ Tenant creado: ${tenant.name} (${tenant.id})`);

  // 1.b Usuario administrador para el panel (login del dashboard)
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@sonrisaspolanco.mx';
  const existingAdmin = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
  });

  if (!existingAdmin) {
    const envPassword = process.env.SEED_ADMIN_PASSWORD;
    if (!envPassword && process.env.NODE_ENV === 'production') {
      throw new Error('SEED_ADMIN_PASSWORD es obligatorio en producción para crear el administrador');
    }
    const adminPassword = envPassword || randomBytes(9).toString('base64url');

    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        name: 'Administrador',
        role: 'ADMIN',
        passwordHash: await hashPassword(adminPassword),
      },
    });

    if (envPassword) {
      console.log(`✅ Usuario administrador creado: ${adminEmail}`);
    } else {
      console.log(`✅ Usuario administrador creado: ${adminEmail}`);
      console.log(`🔑 Contraseña temporal generada (cámbiala después): ${adminPassword}`);
    }
  } else {
    console.log(`ℹ️ Usuario administrador ya existente: ${adminEmail}`);
  }

  // 2. Crear Doctores
  const drSofia = await prisma.doctor.create({
    data: {
      tenantId: tenant.id,
      name: 'Dra. Sofía Silva',
      specialty: 'Odontología General y Estética Dental',
      email: 'dra.sofia@sonrisaspolanco.mx',
      phone: '+525511223344',
      availabilityRules: JSON.stringify({
        days: {
          1: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }], // Lun
          2: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }], // Mar
          3: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }], // Mie
          4: [{ start: '09:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' }], // Jue
          5: [{ start: '09:00', end: '15:00' }],                                         // Vie
          6: [{ start: '10:00', end: '14:00' }],                                         // Sab
        },
        slotDurationMinutes: 45,
        bufferBetweenAppointmentsMinutes: 15,
      }),
      isActive: true,
    },
  });

  const drAlejandro = await prisma.doctor.create({
    data: {
      tenantId: tenant.id,
      name: 'Dr. Alejandro Morales',
      specialty: 'Cirugía Maxilofacial y Endodoncia',
      email: 'dr.alejandro@sonrisaspolanco.mx',
      phone: '+525599887766',
      availabilityRules: JSON.stringify({
        days: {
          1: [{ start: '10:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' }],
          3: [{ start: '10:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' }],
          5: [{ start: '10:00', end: '17:00' }],
        },
        slotDurationMinutes: 60,
        bufferBetweenAppointmentsMinutes: 15,
      }),
      isActive: true,
    },
  });

  console.log(`✅ Doctores registrados: ${drSofia.name}, ${drAlejandro.name}`);

  // 3. Crear Servicios Dentales con precios en MXN y anticipos
  const services = [
    {
      name: 'Valoración Inicial y Diagnóstico con Rx',
      description: 'Revisión bucodental completa, odontograma digital y radiografía periapical si es requerida.',
      durationMinutes: 30,
      priceMxn: 400.0,
      requiredDepositMxn: 0.0,
      category: 'Diagnóstico',
    },
    {
      name: 'Limpieza Dental con Ultrasonido y Pulido',
      description: 'Remoción de placa bacteriana, cálculo (sarro) supragingival y profilaxis con pasta abrasiva.',
      durationMinutes: 45,
      priceMxn: 850.0,
      requiredDepositMxn: 200.0,
      category: 'Prevención',
    },
    {
      name: 'Blanqueamiento Dental Láser / LED',
      description: 'Aclaramiento dental en una sola sesión clínica con peróxido de hidrógeno activado por luz.',
      durationMinutes: 60,
      priceMxn: 2600.0,
      requiredDepositMxn: 500.0,
      category: 'Estética',
    },
    {
      name: 'Tratamiento de Conductos (Endodoncia Unirradicular)',
      description: 'Eliminación de la pulpa infectada, desinfección y sellado tridimensional del conducto.',
      durationMinutes: 90,
      priceMxn: 3200.0,
      requiredDepositMxn: 500.0,
      category: 'Especialidad',
    },
    {
      name: 'Extracción de Muela del Juicio (Tercer Molar)',
      description: 'Procedimiento quirúrgico con anestesia local para remoción de tercer molar impactado o erupcionado.',
      durationMinutes: 60,
      priceMxn: 1950.0,
      requiredDepositMxn: 300.0,
      category: 'Cirugía',
    },
  ];

  for (const s of services) {
    await prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.durationMinutes,
        priceMxn: s.priceMxn,
        requiredDepositMxn: s.requiredDepositMxn,
        category: s.category,
      },
    });
  }

  console.log(`✅ ${services.length} Servicios creados con precios en MXN.`);

  // 4. Preguntas Frecuentes (FAQs) de la clínica
  const faqs = [
    {
      question: '¿Dónde están ubicados y cuentan con estacionamiento?',
      answer: 'Estamos en Av. Horacio 1520, Polanco, Miguel Hidalgo, CDMX. Contamos con servicio de Valet Parking en la entrada de la clínica y convenio con el estacionamiento de Plaza Polanco.',
      category: 'Ubicación',
      keywords: 'ubicacion, direccion, estacionamiento, como llegar, valet parking, donde estan',
    },
    {
      question: '¿Qué formas de pago aceptan?',
      answer: 'Aceptamos tarjetas de débito y crédito (Visa, Mastercard, American Express) con hasta 3 y 6 meses sin intereses, transferencias bancarias SPEI, Mercado Pago y efectivo en pesos mexicanos.',
      category: 'Pagos',
      keywords: 'formas de pago, tarjeta, efectivo, meses sin intereses, msi, mercado pago, spei, transferencia',
    },
    {
      question: '¿Atienden urgencias de dolor de muelas o dientes rotos?',
      answer: 'Sí, contamos con espacios reservados todos los días para urgencias de dolor agudo, abscesos o traumatismos dentales. Por favor indícanos tu nivel de dolor para darte prioridad inmediata con el Dr. Alejandro Morales.',
      category: 'Urgencias',
      keywords: 'urgencia, emergencia, dolor, muela, roto, infeccion, sangrado, hinchazon',
    },
    {
      question: '¿Aceptan seguros de gastos médicos mayores?',
      answer: 'Trabajamos por reembolso con todas las aseguradoras nacionales (MetLife, GNP, Monterrey New York Life, AXA, Seguros Atlas, Mapfre). Te entregamos informe médico y factura deducible con CFDI 4.0.',
      category: 'Seguros',
      keywords: 'seguros, seguro de gastos medicos, gnp, metlife, axa, factura, deducible, reembolso',
    },
  ];

  for (const faq of faqs) {
    await prisma.faqItem.create({
      data: {
        tenantId: tenant.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        keywords: faq.keywords,
      },
    });
  }

  console.log(`✅ ${faqs.length} FAQs registradas.`);
  console.log('🎉 Seed completado exitosamente.');
}

main()
  .catch((e) => {
    console.error('Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

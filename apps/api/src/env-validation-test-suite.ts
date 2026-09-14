import { validateEnvironment, assertProductionEnv } from './lib/env.js';

async function runEnvValidationTests() {
  console.log('⚙️ ========================================================');
  console.log('⚙️ INICIANDO PRUEBAS DE VALIDACIÓN DE VARIABLES DE ENTORNO');
  console.log('⚙️ ========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed++;
    }
  }

  // 1. En producción sin variables obligatorias
  const emptyProdEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
  };
  const emptyRes = validateEnvironment(emptyProdEnv);
  assert(!emptyRes.isValid, 'Producción sin variables es inválido');
  assert(emptyRes.missingProductionVars.length === 8, 'Detecta las 8 variables obligatorias faltantes');

  let throwsInProd = false;
  try {
    assertProductionEnv(emptyProdEnv);
  } catch (err: any) {
    throwsInProd = true;
    assert(err.message.includes('Error fatal de configuración'), 'assertProductionEnv lanza error fatal');
    assert(err.message.includes('JWT_SECRET'), 'El mensaje de error menciona JWT_SECRET');
    assert(err.message.includes('CREDENTIALS_ENCRYPTION_KEY'), 'El mensaje de error menciona CREDENTIALS_ENCRYPTION_KEY');
  }
  assert(throwsInProd, 'assertProductionEnv lanzó excepción en producción incompleta');

  // 2. En producción con todas las variables válidas
  const validKey32Bytes = Buffer.alloc(32, 'a').toString('base64');
  const validProdEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    JWT_SECRET: 'super-secret-production-jwt-key-with-32-chars-min',
    CREDENTIALS_ENCRYPTION_KEY: validKey32Bytes,
    CORS_ORIGINS: 'https://panel.sonrisaspolanco.mx,https://admin.sonrisaspolanco.mx',
    PUBLIC_API_HOST: 'api.sonrisaspolanco.mx',
    META_APP_SECRET: 'meta-app-secret-prod-12345',
    TWILIO_AUTH_TOKEN: 'twilio-auth-token-prod-67890',
    MERCADOPAGO_WEBHOOK_SECRET: 'mp-webhook-secret-prod-abcdef',
    PLATFORM_ADMIN_EMAILS: 'director@sonrisaspolanco.mx,admin@sonrisaspolanco.mx',
    TRUST_PROXY: 'true',
    METRICS_TOKEN: 'metrics-secret-token',
  };

  const validRes = validateEnvironment(validProdEnv);
  assert(validRes.isValid, 'Producción con todas las variables es válida');
  assert(validRes.missingProductionVars.length === 0, 'No hay variables faltantes');

  let validThrows = false;
  try {
    assertProductionEnv(validProdEnv);
  } catch {
    validThrows = true;
  }
  assert(!validThrows, 'assertProductionEnv no lanza cuando todo está en orden');

  // 3. Clave de cifrado de credenciales de longitud incorrecta
  const badKeyProdEnv: NodeJS.ProcessEnv = {
    ...validProdEnv,
    CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(16, 'b').toString('base64'), // Solo 16 bytes
  };
  const badKeyRes = validateEnvironment(badKeyProdEnv);
  assert(!badKeyRes.isValid, 'Clave de cifrado de tamaño incorrecto es rechazada');
  assert(
    badKeyRes.missingProductionVars.some((v) => v.includes('32 bytes')),
    'Informa que la clave debe ser de 32 bytes'
  );

  // 4. En desarrollo, no lanza excepción aunque falten variables
  const devEnv: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
  };
  let devThrows = false;
  try {
    assertProductionEnv(devEnv);
  } catch {
    devThrows = true;
  }
  assert(!devThrows, 'assertProductionEnv no lanza en desarrollo');

  console.log('\n========================================================');
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE VALIDACIÓN DE ENTORNO PASARON (${passed}/${passed})`);
    console.log('========================================================\n');
  } else {
    console.error(`💥 FALLARON ${failed} PRUEBAS (${passed} pasadas, ${failed} fallidas)`);
    console.log('========================================================\n');
    process.exit(1);
  }
}

runEnvValidationTests().catch((err) => {
  console.error('Error fatal ejecutando suite de entorno:', err);
  process.exit(1);
});

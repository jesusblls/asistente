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
  assert(emptyRes.missingProductionVars.length === 9, 'Detecta las 9 variables obligatorias faltantes');

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
    VOICE_STREAM_TOKEN: 'a'.repeat(64),
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

  // 3b. VOICE_STREAM_TOKEN ausente o corto impide arrancar en producción
  const { VOICE_STREAM_TOKEN: _omit, ...noVoiceTokenEnv } = validProdEnv;
  const noVoiceRes = validateEnvironment(noVoiceTokenEnv);
  assert(!noVoiceRes.isValid, 'Producción sin VOICE_STREAM_TOKEN es inválida');
  assert(
    noVoiceRes.missingProductionVars.some((v) => v.startsWith('VOICE_STREAM_TOKEN')),
    'Informa que falta VOICE_STREAM_TOKEN'
  );
  const shortVoiceRes = validateEnvironment({ ...validProdEnv, VOICE_STREAM_TOKEN: 'corto-de-31-caracteres-exactos!' });
  assert(!shortVoiceRes.isValid, 'VOICE_STREAM_TOKEN de menos de 32 caracteres es rechazado');
  const blankVoiceRes = validateEnvironment({ ...validProdEnv, VOICE_STREAM_TOKEN: ' '.repeat(40) });
  assert(!blankVoiceRes.isValid, 'VOICE_STREAM_TOKEN de solo espacios es rechazado');
  let voiceThrowMsg = '';
  try {
    assertProductionEnv(noVoiceTokenEnv);
  } catch (err: any) {
    voiceThrowMsg = err.message;
  }
  assert(voiceThrowMsg.includes('VOICE_STREAM_TOKEN'), 'assertProductionEnv menciona VOICE_STREAM_TOKEN al abortar');
  const devNoVoice = validateEnvironment({ NODE_ENV: 'development' });
  assert(
    devNoVoice.warnings.some((w) => w.includes('VOICE_STREAM_TOKEN')),
    'En desarrollo, sin VOICE_STREAM_TOKEN solo se advierte'
  );

  // 3c. SignalWire sin llave de firma: advertencia, no fallo duro
  const swNoKeyRes = validateEnvironment({ ...validProdEnv, SIGNALWIRE_PROJECT_ID: 'proj-123' });
  assert(swNoKeyRes.isValid, 'Credenciales de SignalWire sin SIGNALWIRE_SIGNING_KEY no impiden arrancar');
  assert(
    swNoKeyRes.warnings.some((w) => w.includes('SIGNALWIRE_SIGNING_KEY')),
    'Advierte que falta SIGNALWIRE_SIGNING_KEY si hay credenciales de SignalWire'
  );
  const swWithKeyRes = validateEnvironment({
    ...validProdEnv,
    SIGNALWIRE_PROJECT_ID: 'proj-123',
    SIGNALWIRE_SIGNING_KEY: 'signing-key',
  });
  assert(
    !swWithKeyRes.warnings.some((w) => w.includes('SIGNALWIRE_SIGNING_KEY')),
    'No advierte de SignalWire cuando la llave de firma está configurada'
  );
  assert(
    !validRes.warnings.some((w) => w.includes('SIGNALWIRE_SIGNING_KEY')),
    'No advierte de SignalWire si no se usa SignalWire'
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

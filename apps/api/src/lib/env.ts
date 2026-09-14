export interface EnvValidationResult {
  isValid: boolean;
  missingProductionVars: string[];
  warnings: string[];
}

/**
 * Valida la configuración de variables de entorno requeridas antes del arranque.
 * En producción (NODE_ENV=production), la omisión de cualquiera de las variables
 * críticas impedirá que el servidor inicie (fail-closed).
 */
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const isProduction = env.NODE_ENV === 'production';
  const missingProductionVars: string[] = [];
  const warnings: string[] = [];

  // 1. JWT_SECRET (>= 32 caracteres)
  const jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32) {
    if (isProduction) {
      missingProductionVars.push('JWT_SECRET (debe tener al menos 32 caracteres aleatorios)');
    } else {
      warnings.push('JWT_SECRET no configurado o menor a 32 caracteres: se usará un secreto efímero en memoria');
    }
  }

  // 2. CREDENTIALS_ENCRYPTION_KEY (32 bytes en base64)
  const encKey = env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!encKey) {
    if (isProduction) {
      missingProductionVars.push('CREDENTIALS_ENCRYPTION_KEY (32 bytes en base64 para cifrado AES-256-GCM en reposo)');
    } else {
      warnings.push('CREDENTIALS_ENCRYPTION_KEY no configurado: las credenciales de canal se guardarán sin cifrar');
    }
  } else {
    try {
      const buf = Buffer.from(encKey, 'base64');
      if (buf.length !== 32) {
        if (isProduction) {
          missingProductionVars.push('CREDENTIALS_ENCRYPTION_KEY debe decodificar exactamente a 32 bytes (256 bits)');
        }
      }
    } catch {
      if (isProduction) {
        missingProductionVars.push('CREDENTIALS_ENCRYPTION_KEY no es una cadena Base64 válida');
      }
    }
  }

  // 3. CORS_ORIGINS
  const corsOrigins = env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) || [];
  if (corsOrigins.length === 0) {
    if (isProduction) {
      missingProductionVars.push('CORS_ORIGINS (lista de orígenes autorizados separados por coma, ej. https://panel.clinica.mx)');
    }
  }

  // 4. PUBLIC_API_HOST
  const publicHost = env.PUBLIC_API_HOST?.trim();
  if (!publicHost) {
    if (isProduction) {
      missingProductionVars.push('PUBLIC_API_HOST (host público sin protocolo, ej. api.clinica.mx, requerido por Twilio Media Streams)');
    }
  }

  // 5. META_APP_SECRET
  const metaSecret = env.META_APP_SECRET?.trim();
  if (!metaSecret) {
    if (isProduction) {
      missingProductionVars.push('META_APP_SECRET (secreto de la app de Meta para validar firmas HMAC-SHA256 de webhooks de WhatsApp)');
    }
  }

  // 6. TWILIO_AUTH_TOKEN
  const twilioToken = env.TWILIO_AUTH_TOKEN?.trim();
  if (!twilioToken) {
    if (isProduction) {
      missingProductionVars.push('TWILIO_AUTH_TOKEN (token de autenticación de Twilio para validar firmas HMAC-SHA1 de telefonía)');
    }
  }

  // 7. MERCADOPAGO_WEBHOOK_SECRET
  const mpSecret = env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!mpSecret) {
    if (isProduction) {
      missingProductionVars.push('MERCADOPAGO_WEBHOOK_SECRET (secreto para validar webhooks de pagos y anticipos)');
    }
  }

  // 8. PLATFORM_ADMIN_EMAILS
  const platformAdmins = env.PLATFORM_ADMIN_EMAILS?.split(',').map((e) => e.trim()).filter(Boolean) || [];
  if (platformAdmins.length === 0) {
    if (isProduction) {
      missingProductionVars.push('PLATFORM_ADMIN_EMAILS (al menos un correo autorizado para dar de alta clínicas)');
    }
  }

  // Recomendaciones operativas en producción
  if (isProduction) {
    if (env.TRUST_PROXY !== 'true') {
      warnings.push('TRUST_PROXY no es "true": si la API corre tras un balanceador/reverse-proxy, la auditoría registrará la IP del proxy para todos');
    }
    if (!env.METRICS_TOKEN?.trim()) {
      warnings.push('METRICS_TOKEN no configurado: los endpoints de observabilidad (/metrics y /metrics/prometheus) responderán 404');
    }
  }

  const isValid = missingProductionVars.length === 0;

  return {
    isValid,
    missingProductionVars,
    warnings,
  };
}

/**
 * Valida el entorno y lanza un error fatal en producción si faltan variables obligatorias.
 */
export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const result = validateEnvironment(env);

  for (const warn of result.warnings) {
    console.warn(`⚠️ [ENV] ${warn}`);
  }

  if (!result.isValid) {
    const errorDetails = result.missingProductionVars.map((v) => `  - ${v}`).join('\n');
    throw new Error(
      `❌ Error fatal de configuración: faltan ${result.missingProductionVars.length} variables obligatorias en producción:\n${errorDetails}\n\nRevisa .env.example para la especificación completa.`
    );
  }
}

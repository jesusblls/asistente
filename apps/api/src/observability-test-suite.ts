import {
  incrementCounter,
  recordTiming,
  resetObservability,
  snapshotMetrics,
  toPrometheusText,
} from '@asistente/observability';
import { buildServer } from './server.js';

process.env.JWT_SECRET ||= 'observability-test-secret-32-characters-min';
process.env.NODE_ENV ||= 'test';

async function runObservabilityTests() {
  console.log('📈 ========================================================');
  console.log('📈 SUITE DE OBSERVABILIDAD Y MÉTRICAS');
  console.log('📈 ========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${title}`);
      passed += 1;
    } else {
      console.error(`  ❌ [FAIL] ${title}`);
      failed += 1;
    }
  }

  const app = await buildServer({ logger: false });
  await app.ready();

  const originalNodeEnv = process.env.NODE_ENV;
  const originalMetricsToken = process.env.METRICS_TOKEN;
  const originalCorsOrigins = process.env.CORS_ORIGINS;

  try {
    console.log('📈 1. Health enriquecido');
    const health = await app.inject({ method: 'GET', url: '/health' });
    const healthBody = health.json();
    assert(
      health.statusCode === 200 &&
        healthBody.queue !== undefined &&
        typeof healthBody.queueWorker === 'string' &&
        Array.isArray(healthBody.metrics),
      '/health reporta estado de cola, worker y métricas'
    );

    console.log('\n📈 2. Contadores HTTP y latencias');
    resetObservability();
    await app.inject({ method: 'GET', url: '/health' });
    await app.inject({ method: 'GET', url: '/health' });
    const metricsAfterRequests = snapshotMetrics();
    const requestCounter = metricsAfterRequests.find((metric) =>
      metric.name.startsWith('http_requests_total')
    );
    const durationHistogram = metricsAfterRequests.find((metric) =>
      metric.name.startsWith('http_request_duration_ms')
    );
    assert(
      Boolean(requestCounter && requestCounter.count >= 2),
      'http_requests_total incrementa con cada request'
    );
    assert(
      Boolean(durationHistogram && durationHistogram.count >= 2 && durationHistogram.avg >= 0),
      'http_request_duration_ms registra latencias (avg y p95 base)'
    );

    console.log('\n📈 3. Endpoint /metrics protegido por token');
    process.env.METRICS_TOKEN = 'test-metrics-token';

    const noToken = await app.inject({ method: 'GET', url: '/metrics' });
    assert(noToken.statusCode === 401, '/metrics sin token responde 401');

    const wrongToken = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-metrics-token': 'otro-token' },
    });
    assert(wrongToken.statusCode === 401, '/metrics con token incorrecto responde 401');

    const withToken = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { 'x-metrics-token': 'test-metrics-token' },
    });
    assert(
      withToken.statusCode === 200 &&
        Array.isArray(withToken.json().metrics) &&
        withToken.json().queue !== undefined,
      '/metrics con token correcto devuelve métricas y estado de cola'
    );

    console.log('\n📈 4. Export Prometheus');
    resetObservability();
    incrementCounter('test_events_total', { kind: 'demo' });
    recordTiming('test_duration_ms', 12, { route: '/demo' });
    const prometheusText = toPrometheusText();
    assert(
      prometheusText.includes('test_events_total{kind="demo"} 1') &&
        prometheusText.includes('test_duration_ms_count{route="/demo"} 1'),
      'toPrometheusText exporta contadores y timings con labels'
    );

    const prometheusNoToken = await app.inject({ method: 'GET', url: '/metrics/prometheus' });
    assert(prometheusNoToken.statusCode === 401, '/metrics/prometheus sin token responde 401');

    const prometheusWithToken = await app.inject({
      method: 'GET',
      url: '/metrics/prometheus',
      headers: { 'x-metrics-token': 'test-metrics-token' },
    });
    assert(
      prometheusWithToken.statusCode === 200 &&
        prometheusWithToken.headers['content-type']?.includes('text/plain') &&
        prometheusWithToken.body.includes('test_events_total'),
      '/metrics/prometheus devuelve texto Prometheus válido'
    );

    console.log('\n📈 5. Fail-closed sin token en producción');
    delete process.env.METRICS_TOKEN;
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'http://localhost:3001';
    process.env.PUBLIC_API_HOST = 'api.clinica.mx';
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 'k').toString('base64');
    process.env.META_APP_SECRET = 'test-meta-secret';
    process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
    process.env.MERCADOPAGO_WEBHOOK_SECRET = 'test-mp-secret';
    process.env.PLATFORM_ADMIN_EMAILS = 'admin@clinica.mx';

    const productionApp = await buildServer({ logger: false });
    await productionApp.ready();
    const productionMetrics = await productionApp.inject({ method: 'GET', url: '/metrics' });
    await productionApp.close();

    assert(
      productionMetrics.statusCode === 404,
      'En producción, /metrics sin METRICS_TOKEN responde 404'
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalMetricsToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = originalMetricsToken;
    if (originalCorsOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = originalCorsOrigins;
    delete process.env.PUBLIC_API_HOST;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.META_APP_SECRET;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
    delete process.env.PLATFORM_ADMIN_EMAILS;
    await app.close();
  }

  console.log('\n========================================================');
  console.log(`🏁 RESULTADO OBSERVABILIDAD: ${passed} pruebas exitosas, ${failed} fallidas.`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runObservabilityTests().catch((error) => {
  console.error('Error en la suite de observabilidad:', error);
  process.exit(1);
});

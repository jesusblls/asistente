import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runner de suites de la API.
 *
 * Descubre automáticamente todos los archivos `*-test-suite.ts` de este
 * directorio y los ejecuta en orden alfabético, cada uno en su propio proceso
 * (aislamiento de estado global: mocks de fetch, variables de entorno, etc.).
 *
 * Para agregar una suite basta crear `src/<nombre>-test-suite.ts` que llame a
 * `process.exit(1)` cuando falle; no hace falta tocar package.json ni el CI.
 */
const here = dirname(fileURLToPath(import.meta.url));

const suites = readdirSync(here)
  .filter((file) => file.endsWith('-test-suite.ts'))
  .sort();

if (suites.length === 0) {
  console.error('No se encontraron suites *-test-suite.ts');
  process.exit(1);
}

console.log(`\n🧪 Ejecutando ${suites.length} suites de la API: ${suites.join(', ')}\n`);

const failedSuites: string[] = [];

for (const suite of suites) {
  console.log(`\n────────────── ${suite} ──────────────`);
  const result = spawnSync('npx', ['tsx', join(here, suite)], {
    stdio: 'inherit',
    env: process.env,
    cwd: join(here, '..', '..'),
  });

  if (result.status !== 0) failedSuites.push(suite);
}

console.log('\n========================================================');
if (failedSuites.length > 0) {
  console.error(`❌ Suites fallidas (${failedSuites.length}): ${failedSuites.join(', ')}`);
  console.log('========================================================\n');
  process.exit(1);
}

console.log(`✅ Todas las suites de la API pasaron (${suites.length}/${suites.length}).`);
console.log('========================================================\n');

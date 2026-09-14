/**
 * Re-cifra `ChannelConfig.credentials` con la llave vigente.
 *
 *   npm run credentials:rotate --workspace=packages/database
 *
 * Sirve para dos cosas:
 *  - Pasar a cifrado las filas legadas que quedaron en claro.
 *  - Rotar la llave: pon la nueva en `CREDENTIALS_ENCRYPTION_KEY`, la vieja en
 *    `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS`, corre este script y retira la
 *    vieja del entorno.
 *
 * Es idempotente: una fila ya cifrada con la llave vigente se deja intacta.
 */
import { db } from './client.js';
import { decryptCredentials, encryptCredentials, isEncryptedCredential } from './credentials.js';

const previous = process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;

async function main() {
  const rows = await db.channelConfig.findMany();
  if (rows.length === 0) {
    console.log('No hay ChannelConfig que re-cifrar.');
    return;
  }

  let rotated = 0;
  let already = 0;
  let undecryptable = 0;

  for (const row of rows) {
    let plaintext: string;

    if (isEncryptedCredential(row.credentials)) {
      // ¿Ya está con la llave vigente? Entonces no hay nada que hacer.
      try {
        decryptCredentials(row.credentials);
        already += 1;
        continue;
      } catch {
        // Cifrada con otra llave: se intenta con la anterior.
      }

      try {
        plaintext = decryptCredentials(row.credentials, previous);
      } catch {
        console.warn(
          `⚠️ ${row.id} (${row.channelType}): no se pudo descifrar con la llave vigente ni con la anterior; se deja intacto.`
        );
        undecryptable += 1;
        continue;
      }
    } else {
      plaintext = row.credentials; // fila legada en claro
    }

    const next = encryptCredentials(plaintext);
    if (next === row.credentials) {
      already += 1;
      continue;
    }

    await db.channelConfig.update({ where: { id: row.id }, data: { credentials: next } });
    rotated += 1;
    console.log(`✓ ${row.id} (${row.channelType}) re-cifrado`);
  }

  console.log(
    `\nListo: ${rotated} re-cifrados, ${already} ya al día, ${undecryptable} ilegibles de ${rows.length}.`
  );
}

main()
  .catch((error) => {
    console.error('Error re-cifrando credenciales:', error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

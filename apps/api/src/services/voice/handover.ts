/**
 * Transferencia de una llamada en curso a recepción humana.
 *
 * Los Media Streams (Twilio o SignalWire) no permiten insertar TwiML/cXML a
 * mitad del stream, pero sí redirigir una llamada viva con la API REST
 * (`Calls/{sid}` + parámetro `Twiml`). Al redirigir, el proveedor corta el
 * `<Stream>` y ejecuta el nuevo TwiML con el `<Dial>` al número humano.
 *
 * Soporta dos proveedores de telefonía, detectando cuál está configurado:
 * - **SignalWire** (proveedor activo actual): si `SIGNALWIRE_PROJECT_ID`,
 *   `SIGNALWIRE_API_TOKEN` y `SIGNALWIRE_SPACE_URL` están las tres presentes,
 *   se usa su API de compatibilidad LaML
 *   (`https://<space>/api/laml/2010-04-01/Accounts/<project>/Calls/{sid}.json`),
 *   que espeja 1:1 el formato REST de Twilio (mismo body `Twiml=`, misma
 *   Basic Auth con `PROJECT_ID:API_TOKEN`).
 * - **Twilio** (comportamiento histórico, usado como fallback si no hay
 *   configuración completa de SignalWire): `TWILIO_ACCOUNT_SID` +
 *   `TWILIO_AUTH_TOKEN` contra `https://api.twilio.com/2010-04-01/...`.
 *
 * Si ninguno de los dos proveedores tiene su configuración completa (o falta
 * `TWILIO_HUMAN_NUMBER`) la función devuelve `false` y el pipeline cierra la
 * llamada con el aviso habitual (nunca deja al paciente en silencio).
 */

export interface RedirectCallToHumanParams {
  callSid: string;
  /** Número que marcó el paciente; se usa como callerId del Dial. */
  callerId?: string;
}

export interface RedirectCallToHumanDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildHumanHandoverTwiml(params: {
  humanNumber: string;
  callerId?: string;
  timeoutSeconds?: number;
}): string {
  const callerId = params.callerId ? ` callerId="${escapeXml(params.callerId)}"` : '';
  return `<Response><Dial timeout="${params.timeoutSeconds ?? 30}"${callerId}>${escapeXml(
    params.humanNumber
  )}</Dial></Response>`;
}

/**
 * Resuelve las credenciales REST del proveedor de telefonía activo.
 *
 * Prioriza SignalWire (proveedor real en uso) cuando su configuración está
 * completa; si no, cae al comportamiento histórico con Twilio. Nunca mezcla
 * credenciales de ambos.
 */
function resolveTelephonyProvider(
  env: NodeJS.ProcessEnv
): { url: (callSid: string) => string; authorization: string } | null {
  const signalwireProjectId = env.SIGNALWIRE_PROJECT_ID;
  const signalwireApiToken = env.SIGNALWIRE_API_TOKEN;
  const signalwireSpaceUrl = env.SIGNALWIRE_SPACE_URL;

  if (signalwireProjectId && signalwireApiToken && signalwireSpaceUrl) {
    // El usuario puede haber capturado la Space URL con protocolo y/o slash
    // final (ej. "https://jesusblls.signalwire.com/"); se normaliza a solo
    // host antes de anteponer nosotros mismos el "https://".
    const space = signalwireSpaceUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return {
      url: (callSid: string) =>
        `https://${space}/api/laml/2010-04-01/Accounts/${encodeURIComponent(
          signalwireProjectId
        )}/Calls/${encodeURIComponent(callSid)}.json`,
      authorization: Buffer.from(`${signalwireProjectId}:${signalwireApiToken}`).toString(
        'base64'
      ),
    };
  }

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  if (accountSid && authToken) {
    return {
      url: (callSid: string) =>
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          accountSid
        )}/Calls/${encodeURIComponent(callSid)}.json`,
      authorization: Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
    };
  }

  return null;
}

export async function redirectCallToHuman(
  params: RedirectCallToHumanParams,
  deps: RedirectCallToHumanDeps = {}
): Promise<boolean> {
  const env = deps.env ?? process.env;
  // El número humano a marcar no depende del proveedor de telefonía activo
  // (Twilio o SignalWire) — es simplemente "a qué número transferir", por lo
  // que conserva su nombre histórico `TWILIO_HUMAN_NUMBER` sin prefijo nuevo.
  const humanNumber = env.TWILIO_HUMAN_NUMBER;

  const provider = resolveTelephonyProvider(env);
  if (!provider || !humanNumber || !params.callSid) return false;

  const timeoutSeconds = Number(env.TWILIO_HUMAN_DIAL_TIMEOUT || 30);
  const twiml = buildHumanHandoverTwiml({
    humanNumber,
    callerId: params.callerId,
    timeoutSeconds: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : 30,
  });

  const url = provider.url(params.callSid);
  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${provider.authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Twiml: twiml }).toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

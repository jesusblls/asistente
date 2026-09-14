/**
 * Transferencia de una llamada en curso a recepción humana.
 *
 * Twilio Media Streams no permite insertar TwiML a mitad del stream, pero sí
 * redirigir una llamada viva con la API REST (`Calls/{sid}` + parámetro
 * `Twiml`). Al redirigir, Twilio corta el `<Stream>` y ejecuta el nuevo TwiML
 * con el `<Dial>` al número humano.
 *
 * Sin `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` o `TWILIO_HUMAN_NUMBER`
 * configurados la función devuelve `false` y el pipeline cierra la llamada con
 * el aviso habitual (nunca deja al paciente en silencio).
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

export async function redirectCallToHuman(
  params: RedirectCallToHumanParams,
  deps: RedirectCallToHumanDeps = {}
): Promise<boolean> {
  const env = deps.env ?? process.env;
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const humanNumber = env.TWILIO_HUMAN_NUMBER;

  if (!accountSid || !authToken || !humanNumber || !params.callSid) return false;

  const timeoutSeconds = Number(env.TWILIO_HUMAN_DIAL_TIMEOUT || 30);
  const twiml = buildHumanHandoverTwiml({
    humanNumber,
    callerId: params.callerId,
    timeoutSeconds: Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : 30,
  });

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Calls/${encodeURIComponent(params.callSid)}.json`;
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const fetchImpl = deps.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Twiml: twiml }).toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

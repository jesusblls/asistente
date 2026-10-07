import type { Metadata } from 'next';
import { LegalDocument, LegalSection, EntityField } from '../../components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Aviso de Privacidad | AsistentePro',
  description: 'Cómo AsistentePro trata los datos personales de las clínicas y de sus pacientes.',
};

/**
 * Aviso de privacidad integral (LFPDPPP).
 *
 * Distingue los dos papeles que juega la plataforma, porque las obligaciones
 * cambian: RESPONSABLE de los datos de las clínicas que contratan (cuentas
 * del personal, facturación) y ENCARGADO de los datos de los pacientes, que
 * pertenecen a cada clínica y que esta debe informar con su propio aviso.
 *
 * La lista de proveedores refleja lo que el código realmente usa. Si se
 * agrega o quita una integración, este texto se actualiza y LEGAL_VERSION
 * sube. Requiere revisión de un abogado antes de considerarse definitivo.
 */
export default function PrivacidadPage() {
  return (
    <LegalDocument
      title="Aviso de Privacidad"
      intro={
        <p>
          <EntityField field="razonSocial" /> (&ldquo;AsistentePro&rdquo;), con domicilio en{' '}
          <EntityField field="domicilio" />, es responsable del tratamiento de los datos personales de las
          clínicas y consultorios que usan la plataforma, en términos de la Ley Federal de Protección de Datos
          Personales en Posesión de los Particulares y su normativa aplicable.
        </p>
      }
    >
      <LegalSection title="1. Dos papeles distintos">
        <p>
          <strong>Como responsable</strong>, tratamos los datos de las clínicas que contratan el servicio y de
          su personal: quién crea la cuenta, quién entra al panel y cómo se cobra la suscripción.
        </p>
        <p>
          <strong>Como encargado</strong>, tratamos los datos de los pacientes de cada clínica únicamente por
          cuenta y bajo las instrucciones de esa clínica, que es la responsable frente a sus pacientes. Cada
          clínica debe poner a disposición de sus pacientes su propio aviso de privacidad. No usamos los datos
          de los pacientes para fines propios, no los vendemos y no los compartimos entre clínicas.
        </p>
      </LegalSection>

      <LegalSection title="2. Datos que tratamos">
        <p><strong>De la clínica y su personal:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nombre de la clínica, teléfono, doctores, servicios, precios y horarios que capturan.</li>
          <li>Nombre, correo electrónico y rol de cada usuario. La contraseña se guarda solo como hash: nadie, ni nuestro equipo, puede leerla.</li>
          <li>Dirección IP, navegador, fecha y hora de cada inicio de sesión y de cada acceso o cambio a expedientes, en una bitácora de auditoría que no se puede modificar.</li>
          <li>Plan contratado y estado de pagos. Los datos de tarjeta los captura y resguarda Mercado Pago; nosotros no los recibimos.</li>
        </ul>
        <p><strong>De los pacientes (como encargado):</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Nombre, teléfono y, si lo comparten, correo electrónico.</li>
          <li>Mensajes de WhatsApp y transcripciones de llamadas con el asistente.</li>
          <li>Citas, servicio solicitado y estado del anticipo.</li>
          <li>
            <strong>Datos sensibles de salud:</strong> los síntomas o molestias que el paciente describe para
            que el asistente evalúe la urgencia y agende con el especialista adecuado.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Para qué los usamos">
        <p><strong>Finalidades necesarias para el servicio:</strong></p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Crear y administrar la cuenta de la clínica y el acceso de su personal.</li>
          <li>Que el asistente conteste a los pacientes por WhatsApp y teléfono, evalúe la urgencia de sus síntomas y agende, confirme o cancele citas.</li>
          <li>Generar los enlaces de anticipo que la clínica configure y confirmar su pago.</li>
          <li>Cobrar la suscripción de la clínica.</li>
          <li>Registrar quién accede a cada expediente, como exige la normativa de expedientes clínicos.</li>
          <li>Enviar correos operativos indispensables, como el de recuperación de contraseña.</li>
          <li>Detectar fallas, abuso y accesos indebidos.</li>
        </ul>
        <p>
          No tratamos los datos para finalidades secundarias: no hacemos mercadotecnia con ellos, no los
          usamos para entrenar modelos de inteligencia artificial propios y no los compartimos con anunciantes.
        </p>
      </LegalSection>

      <LegalSection title="4. Con quién se comparten">
        <p>
          Para prestar el servicio, los datos pasan por los siguientes proveedores, que los tratan solo para
          ese fin. Varios están fuera de México, por lo que hay transferencias internacionales:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200 rounded-lg">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-semibold">Proveedor</th>
                <th className="px-3 py-2 font-semibold">Para qué</th>
                <th className="px-3 py-2 font-semibold">País</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="px-3 py-2">OVHcloud</td><td className="px-3 py-2">Servidor y base de datos donde se alojan todos los datos</td><td className="px-3 py-2">Canadá</td></tr>
              <tr><td className="px-3 py-2">DeepSeek</td><td className="px-3 py-2">Modelo de lenguaje que redacta las respuestas del asistente a partir de la conversación</td><td className="px-3 py-2">China</td></tr>
              <tr><td className="px-3 py-2">Deepgram</td><td className="px-3 py-2">Convertir a texto la voz del paciente durante la llamada</td><td className="px-3 py-2">Estados Unidos</td></tr>
              <tr><td className="px-3 py-2">Cartesia</td><td className="px-3 py-2">Convertir a voz las respuestas del asistente</td><td className="px-3 py-2">Estados Unidos</td></tr>
              <tr><td className="px-3 py-2">Meta (WhatsApp Business)</td><td className="px-3 py-2">Recibir y enviar mensajes de WhatsApp</td><td className="px-3 py-2">Estados Unidos</td></tr>
              <tr><td className="px-3 py-2">Twilio / SignalWire</td><td className="px-3 py-2">Telefonía: recibir llamadas y transferirlas a recepción</td><td className="px-3 py-2">Estados Unidos</td></tr>
              <tr><td className="px-3 py-2">Mercado Pago</td><td className="px-3 py-2">Cobro de anticipos y de la suscripción</td><td className="px-3 py-2">México</td></tr>
              <tr><td className="px-3 py-2">Resend</td><td className="px-3 py-2">Envío de correos operativos</td><td className="px-3 py-2">Estados Unidos</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Fuera de estos casos, solo entregamos datos a autoridades que los requieran conforme a la ley.
        </p>
      </LegalSection>

      <LegalSection title="5. Tus derechos ARCO y cómo ejercerlos">
        <p>
          Puedes pedir <strong>acceso</strong> a tus datos, su <strong>rectificación</strong> si son inexactos,
          su <strong>cancelación</strong> o <strong>oponerte</strong> a su tratamiento, así como revocar tu
          consentimiento o limitar su uso, escribiendo a <EntityField field="correoPrivacidad" />. Incluye tu
          nombre, un medio para responderte, el documento que acredite tu identidad (o la de tu representante)
          y una descripción clara de lo que pides.
        </p>
        <p>
          Respondemos en un máximo de 20 días hábiles y, si procede, lo hacemos efectivo dentro de los 15 días
          hábiles siguientes.
        </p>
        <p>
          <strong>Si eres paciente de una clínica</strong>, dirige tu solicitud a esa clínica, que es la
          responsable de tus datos. Si nos escribes a nosotros, se la turnaremos y la apoyaremos para atenderla.
        </p>
        <p>
          Los registros de auditoría y los expedientes clínicos tienen plazos mínimos de conservación por ley
          (la NOM-004-SSA3-2012 fija cinco años para el expediente clínico). Una cancelación puede quedar
          bloqueada hasta que venzan esos plazos; te lo informaremos si es el caso.
        </p>
      </LegalSection>

      <LegalSection title="6. Cookies y almacenamiento en el navegador">
        <p>
          Usamos una sola cookie, indispensable, para mantener abierta la sesión del panel (12 horas). El
          panel también guarda en el navegador tu nombre y la clínica activa para mostrarlos sin volver a
          pedirlos. No usamos cookies de publicidad ni herramientas de analítica de terceros.
        </p>
      </LegalSection>

      <LegalSection title="7. Seguridad">
        <p>
          Las conexiones viajan cifradas (HTTPS), las contraseñas se guardan como hash, las credenciales de
          WhatsApp y telefonía de cada clínica se cifran en la base de datos, cada clínica solo ve sus propios
          datos y todo acceso a expedientes queda registrado.
        </p>
      </LegalSection>

      <LegalSection title="8. Cambios a este aviso">
        <p>
          Publicaremos cualquier cambio en esta página con su nueva fecha de vigencia. Si el cambio afecta
          finalidades o transferencias, lo avisaremos además por correo a los administradores de cada clínica.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { TRIAL_DURATION_DAYS } from '@asistente/shared-types';
import { LegalDocument, LegalSection, EntityField } from '../../components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Términos de Servicio | AsistentePro',
  description: 'Condiciones de uso de la plataforma AsistentePro para clínicas y consultorios.',
};

/**
 * Términos de servicio.
 *
 * Cada regla comercial aquí (prueba, cancelación, suspensión) describe lo que
 * el código ya hace — ver packages/database/src/plan.ts y
 * routes/admin/subscription.ts. Si cambia el comportamiento, cambia el texto
 * y sube LEGAL_VERSION. Requiere revisión de un abogado antes de
 * considerarse definitivo.
 */
export default function TerminosPage() {
  return (
    <LegalDocument
      title="Términos de Servicio"
      intro={
        <p>
          Estos términos regulan el uso de AsistentePro, plataforma operada por{' '}
          <EntityField field="razonSocial" />, por parte de la clínica o consultorio que crea una cuenta (&ldquo;la
          Clínica&rdquo;). Al crear la cuenta, quien la registra declara tener facultades para obligar a la
          Clínica y acepta estos términos y el{' '}
          <Link href="/privacidad" className="text-teal-700 underline">Aviso de Privacidad</Link>.
        </p>
      }
    >
      <LegalSection title="1. El servicio">
        <p>
          AsistentePro es un asistente con inteligencia artificial que atiende a los pacientes de la Clínica por
          WhatsApp y por teléfono: responde preguntas con la información que la Clínica configura, agenda,
          confirma y cancela citas, genera enlaces de anticipo y transfiere a recepción cuando hace falta. Incluye
          un panel para que el personal supervise las conversaciones y tome el control en cualquier momento.
        </p>
      </LegalSection>

      <LegalSection title="2. El asistente no es personal de salud">
        <p>
          El asistente <strong>no diagnostica, no prescribe y no sustituye la valoración de un profesional</strong>.
          Su evaluación de síntomas solo sirve para decidir la prioridad de la cita. Ante señales de una emergencia
          indica al paciente que llame al 911 o acuda a urgencias y avisa a recepción, pero no garantiza detectar
          toda emergencia.
        </p>
        <p>
          La Clínica es responsable de la atención médica que presta, de supervisar las conversaciones y de que
          la información que configura (servicios, precios, horarios, doctores y respuestas frecuentes) sea exacta:
          el asistente responde con base en ella.
        </p>
      </LegalSection>

      <LegalSection title="3. Prueba gratuita, planes y pagos">
        <ul className="list-disc pl-5 space-y-1">
          <li>Las cuentas nuevas tienen {TRIAL_DURATION_DAYS} días de prueba sin tarjeta. Al terminar, el servicio se suspende hasta que se contrate un plan; no hay cargos automáticos al terminar la prueba.</li>
          <li>Los planes se cobran por adelantado, de forma mensual o anual, en pesos mexicanos, mediante suscripción recurrente en Mercado Pago.</li>
          <li>Cada plan tiene límites (doctores, citas al mes, minutos de voz) que se muestran al contratarlo. Al alcanzar un límite, el asistente deja de tomar nuevas citas o llamadas de ese tipo hasta el siguiente periodo o hasta cambiar de plan.</li>
          <li>Si un cobro falla, el servicio continúa mientras siga vigente el periodo ya pagado y se suspende al terminar si el pago no se regulariza.</li>
          <li>Los precios pueden cambiar; avisaremos con al menos 30 días de anticipación y el cambio aplicará a partir del siguiente periodo.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Cancelación">
        <p>
          La Clínica puede cancelar la renovación en cualquier momento desde el panel. El acceso sigue hasta el fin
          del periodo pagado y no se hacen reembolsos proporcionales. Después de la cancelación, la Clínica puede
          solicitar una exportación de sus datos durante 30 días; pasado ese plazo los eliminaremos, salvo los
          registros que la ley obligue a conservar.
        </p>
      </LegalSection>

      <LegalSection title="5. Datos de los pacientes">
        <p>
          La Clínica es la <strong>responsable</strong> de los datos personales de sus pacientes y AsistentePro
          actúa como <strong>encargado</strong>. En consecuencia, AsistentePro se obliga a:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Tratar esos datos solo para prestar el servicio y conforme a las instrucciones de la Clínica.</li>
          <li>Guardar confidencialidad y mantener las medidas de seguridad descritas en el Aviso de Privacidad.</li>
          <li>No transferirlos salvo a los proveedores listados en el Aviso de Privacidad, necesarios para el servicio.</li>
          <li>Apoyar a la Clínica para atender las solicitudes ARCO de sus pacientes.</li>
          <li>Al terminar la relación, devolverlos o eliminarlos según lo indicado en la sección de Cancelación.</li>
        </ul>
        <p>
          La Clínica, por su parte, se obliga a contar con su propio aviso de privacidad para sus pacientes, a
          obtener el consentimiento que la ley exija para tratar datos de salud y a informar que la atención inicial
          la brinda un asistente automatizado.
        </p>
      </LegalSection>

      <LegalSection title="6. Uso aceptable">
        <p>
          La Clínica no debe usar el servicio para enviar mensajes no solicitados, suplantar a otra persona o
          institución, ni para fines ilícitos, y debe cumplir las políticas de WhatsApp Business. Cada usuario es
          responsable de resguardar su contraseña. Podemos suspender una cuenta que incumpla esta sección, avisando
          a la Clínica salvo que el riesgo sea inmediato.
        </p>
      </LegalSection>

      <LegalSection title="7. Disponibilidad y responsabilidad">
        <p>
          Hacemos lo razonable para que el servicio esté disponible de forma continua, pero puede tener
          interrupciones por mantenimiento o por fallas de proveedores externos (WhatsApp, telefonía, modelos de
          inteligencia artificial). El servicio se ofrece en el estado en que se encuentra. En la medida que la ley
          lo permita, nuestra responsabilidad total frente a la Clínica se limita a lo pagado por ella en los 12
          meses anteriores al hecho que la origine, y no respondemos por lucro cesante ni por decisiones médicas
          tomadas con base en las conversaciones del asistente.
        </p>
      </LegalSection>

      <LegalSection title="8. Cambios a estos términos">
        <p>
          Publicaremos cualquier cambio en esta página con su nueva fecha de vigencia y lo avisaremos por correo a
          los administradores con al menos 15 días de anticipación. Seguir usando el servicio después de esa fecha
          implica aceptar los nuevos términos.
        </p>
      </LegalSection>

      <LegalSection title="9. Contacto y ley aplicable">
        <p>
          Para cualquier asunto relacionado con estos términos escribe a <EntityField field="correoPrivacidad" />.
          Estos términos se rigen por las leyes federales de los Estados Unidos Mexicanos.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}

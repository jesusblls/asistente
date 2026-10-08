'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchAuthMe } from '../../lib/api';

/**
 * Lleva al asistente de configuración a quien todavía no lo terminó.
 *
 * El registro ya manda a `/onboarding` directamente; esto cubre a quien cerró
 * el navegador a medias y vuelve a entrar por `/login`: sin doctores ni
 * precios, el panel no le sirve de nada y la IA no podría atender a un
 * paciente.
 *
 * No bloquea el render: la mayoría de las clínicas ya terminaron y hacerlas
 * esperar una petición en cada carga del panel sería pagar por todas el costo
 * de unas pocas.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Un fallo de red (null) no debe sacar a nadie de su panel.
      const data = await fetchAuthMe();
      if (!data || cancelled) return;
      if (data.onboarding?.step && !data.onboarding?.completedAt) {
        router.replace('/onboarding');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Se revisa una vez por navegación dentro del panel; `pathname` basta como
    // disparador y evita repetir la petición en cada re-render.
  }, [pathname, router]);

  return <>{children}</>;
}

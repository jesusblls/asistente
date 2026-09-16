'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../../lib/api';

/**
 * Puerta de acceso al panel.
 *
 * La sesión solo se puede consultar en el navegador (`localStorage`), así que
 * hasta que el componente monta en el cliente el estado correcto no es "sin
 * sesión" sino **"todavía no se sabe"**. Confundir ambos fue un bug real:
 * recargar (F5) cualquier pantalla del panel, o abrirla desde un favorito,
 * expulsaba al login con la sesión perfectamente válida.
 *
 * El mecanismo, confirmado instrumentando los renders: al cargar la página, el
 * subárbol del panel **se remonta** una vez después de hidratar. La versión
 * anterior resolvía la sesión con `useSyncExternalStore` y, en ese remontaje,
 * React volvía a tomar el `getServerSnapshot` —que devolvía `false`— aunque
 * `localStorage` tuviera la sesión intacta. El `useEffect` leía ese `false` y
 * redirigía antes de que el valor real del cliente volviera a aplicar.
 *
 * Por eso el estado tiene tres valores y no dos: un remontaje devuelve a
 * `verificando`, nunca a `anonimo`, y solo se redirige cuando de verdad se
 * comprobó que no hay sesión. Es también la razón de leer `localStorage` en un
 * efecto y guardarlo en estado, en vez de a través de un store externo: la
 * sesión no es una fuente que cambie sola, es un dato que se lee una vez.
 */
type EstadoSesion = 'verificando' | 'autenticado' | 'anonimo';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Arranca igual en el servidor y en el primer render del cliente, así que no
  // hay discrepancia de hidratación que resolver con un store externo.
  const [estado, setEstado] = useState<EstadoSesion>('verificando');

  useEffect(() => {
    setEstado(isAuthenticated() ? 'autenticado' : 'anonimo');
  }, []);

  useEffect(() => {
    if (estado === 'anonimo') {
      router.replace('/login');
    }
  }, [estado, router]);

  // La comprobación es una lectura síncrona de `localStorage`: dura un tick y
  // no amerita un indicador de carga, que solo produciría un parpadeo.
  if (estado !== 'autenticado') return null;

  return <>{children}</>;
}

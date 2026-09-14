'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../../lib/api';

const emptySubscribe = () => () => {};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const authed = useSyncExternalStore(
    emptySubscribe,
    () => isAuthenticated(),
    () => false
  );

  useEffect(() => {
    if (!authed) {
      router.replace('/login');
    }
  }, [authed, router]);

  if (!authed) return null;
  return <>{children}</>;
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../../lib/api';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const ok = isAuthenticated();
    setAuthed(ok);
    setReady(true);
    if (!ok) router.replace('/login');
  }, [router]);

  if (!ready || !authed) return null;
  return <>{children}</>;
}

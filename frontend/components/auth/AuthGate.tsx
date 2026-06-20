"use client";
// ============================================================================
// spec-034 — route protection. Any route except /login requires an authenticated
// session; otherwise redirect to /login?next=<path>. No "remember me": the
// session only survives via the httpOnly refresh cookie (silent refresh in
// AuthContext.checkAuth), never via a token in storage.
// ============================================================================

import { ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { LOGOUT_KEY } from '@/lib/api/token-store';

const PUBLIC_ROUTES = ['/login'];

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // Cross-tab logout: another tab logging out signs this one out too.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGOUT_KEY && !isPublic) {
        window.location.href = '/login';
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isPublic]);

  // Redirect unauthenticated users away from protected routes.
  useEffect(() => {
    if (isLoading || isPublic) return;
    if (!isAuthenticated) {
      const next = encodeURIComponent(pathname + (typeof window !== 'undefined' ? window.location.search : ''));
      router.replace(`/login?next=${next}`);
    }
  }, [isLoading, isAuthenticated, isPublic, pathname, router]);

  // Public routes always render. Protected routes render once authenticated.
  if (isPublic) return <>{children}</>;
  if (isLoading || !isAuthenticated) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg, #0a0712)', color: 'rgba(255,255,255,0.4)', fontSize: 13,
        fontFamily: "'IBM Plex Sans',sans-serif",
      }}>
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}

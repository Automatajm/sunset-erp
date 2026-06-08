"use client";
// ============================================================================
// spec-034 — inactivity timeout. After 15 min of no interaction, warn "session
// expires in 2 minutes"; after 2 more idle minutes, log out. Any interaction
// resets the timer. The timer is shared across tabs: each tab broadcasts a
// last-activity epoch to localStorage, and listens for others', so activity in
// one tab keeps the rest alive. Rendered by ERPShell (authenticated pages only).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { ACTIVITY_KEY, broadcastActivity } from '@/lib/api/token-store';

const IDLE_MS = 15 * 60 * 1000; // 15 min → warning
const WARN_MS = 2 * 60 * 1000; // +2 min → logout
const BROADCAST_THROTTLE_MS = 5000; // don't hammer localStorage on every mousemove

export default function InactivityGuard() {
  const { logout } = useAuth();
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(0);
  const lastBroadcast = useRef(0);

  useEffect(() => {
    lastActivity.current = Date.now(); // seed on mount (Date.now in render is impure)

    const bump = () => {
      const now = Date.now();
      lastActivity.current = now;
      if (warning) setWarning(false);
      if (now - lastBroadcast.current > BROADCAST_THROTTLE_MS) {
        lastBroadcast.current = now;
        broadcastActivity();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    // Another tab's activity resets this tab's timer.
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) {
        const ts = Number(e.newValue);
        if (ts > lastActivity.current) {
          lastActivity.current = ts;
          setWarning(false);
        }
      }
    };
    window.addEventListener('storage', onStorage);

    const tick = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS + WARN_MS) {
        clearInterval(tick);
        logout();
      } else if (idle >= IDLE_MS) {
        setWarning(true);
      }
    }, 15000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.removeEventListener('storage', onStorage);
      clearInterval(tick);
    };
  }, [warning, logout]);

  const stayActive = () => {
    lastActivity.current = Date.now();
    setWarning(false);
    broadcastActivity();
  };

  if (!warning) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        width: 380, background: '#14101f', border: '0.5px solid rgba(251,146,60,0.25)',
        borderRadius: 12, padding: '24px 26px', fontFamily: "'IBM Plex Sans',sans-serif",
        boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#f1ede8', marginBottom: 8 }}>
          Your session expires in 2 minutes
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginBottom: 20 }}>
          You&apos;ve been inactive. For your security the session will end automatically.
          Choose to stay signed in to continue.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={() => logout()}
            style={{
              border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)',
            }}
          >
            Log out now
          </button>
          <button
            onClick={stayActive}
            style={{
              border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", color: 'white',
              background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)',
            }}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}

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
import { overlayStyle, panelStyle, titleStyle, descriptionStyle, footerStyle, btn } from '@/components/ui/modal/styles';

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

  // Shares the one modal style language (modal/styles.ts) with the
  // ConfirmModal/FormModal/DetailModal system — one overlay/panel/button look.
  // Kept as a plain overlay (not ModalShell) because the session warning must
  // not be dismissible by ESC/overlay click — only an explicit choice.
  return (
    <div style={overlayStyle}>
      <div style={panelStyle(380)}>
        <div style={{ padding: '20px 24px' }}>
          <div style={titleStyle}>Your session expires in 2 minutes</div>
          <div style={descriptionStyle}>
            You&apos;ve been inactive. For your security the session will end automatically.
            Choose to stay signed in to continue.
          </div>
        </div>
        <div style={footerStyle}>
          <button onClick={() => logout()} style={btn('ghost')}>
            Log out now
          </button>
          <button onClick={stayActive} style={btn('primary')}>
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}

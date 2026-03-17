"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && isAuthenticated) router.push('/');
  }, [isAuthenticated, router, mounted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!mounted || isAuthenticated) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .sl-root {
          font-family: 'IBM Plex Sans', sans-serif;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
          background-color: #08060f;
        }

        /* Deep sky — violet at top, warm at horizon bottom */
        .sl-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 100% 55% at 50% 100%, rgba(234, 88, 12, 0.32) 0%, transparent 65%),
            radial-gradient(ellipse 70% 40% at 70% 90%,  rgba(251, 146, 60, 0.18) 0%, transparent 55%),
            radial-gradient(ellipse 60% 45% at 30% 85%,  rgba(220, 38, 38, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse 90% 60% at 50% 110%, rgba(154, 52, 18, 0.25) 0%, transparent 60%),
            linear-gradient(to bottom, #0c0a1a 0%, #120c1e 40%, #1a0e18 70%, #1f1008 100%);
          pointer-events: none;
        }

        /* Faint grid */
        .sl-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 44px 44px;
          pointer-events: none;
        }

        /* Stars */
        .sl-stars {
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(1px 1px at 15% 18%, rgba(255,200,120,0.55) 0%, transparent 100%),
            radial-gradient(1px 1px at 72% 10%, rgba(255,220,160,0.45) 0%, transparent 100%),
            radial-gradient(1px 1px at 88% 33%, rgba(255,200,100,0.4)  0%, transparent 100%),
            radial-gradient(1px 1px at 40% 7%,  rgba(255,240,200,0.5)  0%, transparent 100%),
            radial-gradient(1px 1px at 60% 22%, rgba(255,210,140,0.35) 0%, transparent 100%),
            radial-gradient(1px 1px at 93% 15%, rgba(255,220,180,0.4)  0%, transparent 100%),
            radial-gradient(1px 1px at 8%  40%, rgba(255,200,120,0.35) 0%, transparent 100%),
            radial-gradient(1px 1px at 55% 5%,  rgba(255,230,150,0.3)  0%, transparent 100%);
          pointer-events: none;
        }

        /* Horizon glow */
        .sl-horizon {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, rgba(251,146,60,0.6) 30%, rgba(234,88,12,0.9) 50%, rgba(251,146,60,0.6) 70%, transparent 100%);
          filter: blur(1px);
          z-index: 0;
        }

        /* Card */
        .sl-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 400px;
          background: rgba(10, 7, 18, 0.75);
          border: 1px solid rgba(251, 146, 60, 0.14);
          border-radius: 18px;
          padding: 40px 36px 28px;
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          box-shadow:
            0 0 0 1px rgba(255, 140, 50, 0.05) inset,
            0 32px 80px rgba(0, 0, 0, 0.72),
            0 0 60px rgba(234, 88, 12, 0.07);
        }

        /* Card top accent */
        .sl-card::before {
          content: '';
          position: absolute;
          top: 0; left: 40px; right: 40px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(251,146,60,0.45), transparent);
          border-radius: 1px;
        }

        /* Brand */
        .sl-brand {
          text-align: center;
          margin-bottom: 30px;
        }

        .sl-logomark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
          border-radius: 14px;
          background: linear-gradient(145deg, #c2410c 0%, #ea580c 50%, #f97316 100%);
          box-shadow:
            0 4px 20px rgba(234, 88, 12, 0.45),
            0 0 0 1px rgba(251,146,60,0.25) inset;
          margin-bottom: 18px;
        }

        /* Icon inside logomark — explicitly sized, never grows */
        .sl-logomark svg {
          width: 26px;
          height: 26px;
          display: block;
          flex-shrink: 0;
        }

        .sl-name {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 34px;
          font-weight: 300;
          color: #fff;
          letter-spacing: 0.1em;
          line-height: 1;
          margin-bottom: 7px;
        }

        /* The "set" part glows warm */
        .sl-name-accent { color: #fb923c; }

        .sl-tagline {
          font-size: 11px;
          font-weight: 300;
          color: rgba(255, 255, 255, 0.3);
          letter-spacing: 0.2em;
          text-transform: uppercase;
        }

        /* Form */
        .sl-field { margin-bottom: 14px; }

        .sl-label {
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: rgba(251, 146, 60, 0.65);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .sl-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 8px;
          padding: 11px 14px;
          font-size: 14px;
          font-family: 'IBM Plex Sans', sans-serif;
          color: #f1f5f9;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
          -webkit-appearance: none;
        }

        .sl-input::placeholder { color: rgba(255,255,255,0.18); }

        .sl-input:focus {
          border-color: rgba(251, 146, 60, 0.5);
          background: rgba(255, 255, 255, 0.06);
          box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.1);
        }

        .sl-input:-webkit-autofill,
        .sl-input:-webkit-autofill:hover,
        .sl-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #100c1c inset;
          -webkit-text-fill-color: #f1f5f9;
          caret-color: #f1f5f9;
        }

        .sl-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 16px 0 20px;
        }

        .sl-remember {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.38);
          cursor: pointer;
          user-select: none;
        }

        .sl-remember input[type="checkbox"] {
          width: 14px;
          height: 14px;
          accent-color: #ea580c;
          cursor: pointer;
          flex-shrink: 0;
        }

        .sl-forgot {
          background: none;
          border: none;
          font-size: 12px;
          font-family: 'IBM Plex Sans', sans-serif;
          color: rgba(251, 146, 60, 0.45);
          cursor: pointer;
          padding: 0;
          transition: color 0.2s;
        }
        .sl-forgot:hover { color: rgba(251, 146, 60, 0.8); }

        .sl-btn {
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #c2410c 0%, #ea580c 60%, #f97316 100%);
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          font-family: 'IBM Plex Sans', sans-serif;
          color: #fff;
          cursor: pointer;
          letter-spacing: 0.04em;
          transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 20px rgba(234, 88, 12, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .sl-btn:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 6px 26px rgba(234, 88, 12, 0.55);
        }
        .sl-btn:active:not(:disabled) { transform: translateY(0); }
        .sl-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Spinner icon — always 15×15, never grows */
        .sl-btn svg {
          width: 15px;
          height: 15px;
          display: block;
          flex-shrink: 0;
          animation: sl-spin 0.8s linear infinite;
        }

        @keyframes sl-spin { to { transform: rotate(360deg); } }

        .sl-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.28);
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 18px;
          font-size: 13px;
          color: #fca5a5;
          text-align: center;
        }

        .sl-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 22px 0 14px;
        }
        .sl-div-line { flex: 1; height: 1px; background: rgba(255,255,255,0.06); }
        .sl-div-text {
          font-size: 10px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          flex-shrink: 0;
        }

        .sl-demo {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 8px;
          padding: 12px 14px;
        }

        .sl-demo-title {
          font-size: 10px;
          font-weight: 500;
          color: rgba(251,146,60,0.4);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .sl-demo-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          margin-bottom: 4px;
        }
        .sl-demo-row:last-child { margin-bottom: 0; }
        .sl-demo-key { color: rgba(255,255,255,0.22); }
        .sl-demo-val {
          font-family: 'Courier New', monospace;
          color: rgba(255,255,255,0.48);
          font-size: 11px;
        }

        /* Footer — inside card, never orphaned */
        .sl-footer {
          text-align: center;
          font-size: 10px;
          color: rgba(255,255,255,0.13);
          letter-spacing: 0.04em;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
      `}</style>

      <div className="sl-root">
        <div className="sl-bg" />
        <div className="sl-grid" />
        <div className="sl-stars" />
        <div className="sl-horizon" />

        <div className="sl-card">
          {/* Brand */}
          <div className="sl-brand">
            <div className="sl-logomark">
              {/* Sun at horizon */}
              <svg viewBox="0 0 26 26" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13" cy="11" r="4" />
                <line x1="13" y1="3"    x2="13" y2="5.2" />
                <line x1="19.8" y1="6.2" x2="18.4" y2="7.6" />
                <line x1="22"  y1="13"  x2="19.8" y2="13" />
                <line x1="6.2" y1="6.2" x2="7.6"  y2="7.6" />
                <line x1="4"   y1="13"  x2="6.2"  y2="13" />
                <line x1="3.5" y1="19"  x2="22.5" y2="19" strokeWidth="1.8" />
                <line x1="6.5" y1="22"  x2="19.5" y2="22" strokeWidth="1.2" opacity="0.45" />
              </svg>
            </div>

            <div className="sl-name">
              Sun<span className="sl-name-accent">set</span>
            </div>
            <div className="sl-tagline">Enterprise Resource Planning</div>
          </div>

          {/* Error */}
          {error && <div className="sl-error">{error}</div>}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="sl-field">
              <label className="sl-label" htmlFor="sl-email">Email address</label>
              <input
                id="sl-email"
                className="sl-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="sl-field">
              <label className="sl-label" htmlFor="sl-password">Password</label>
              <input
                id="sl-password"
                className="sl-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="sl-options">
              <label className="sl-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <button type="button" className="sl-forgot">Forgot password?</button>
            </div>

            <button type="submit" className="sl-btn" disabled={isLoading}>
              {isLoading ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Signing in…
                </>
              ) : 'Sign in'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="sl-divider">
            <div className="sl-div-line" />
            <span className="sl-div-text">Demo access</span>
            <div className="sl-div-line" />
          </div>

          <div className="sl-demo">
            <div className="sl-demo-title">Test credentials</div>
            <div className="sl-demo-row">
              <span className="sl-demo-key">Email</span>
              <span className="sl-demo-val">admin@demo.com</span>
            </div>
            <div className="sl-demo-row">
              <span className="sl-demo-key">Password</span>
              <span className="sl-demo-val">Admin123!</span>
            </div>
          </div>

          {/* Footer inside card — no orphan */}
          <div className="sl-footer">© 2026 Sunset · All rights reserved</div>
        </div>
      </div>
    </>
  );
}
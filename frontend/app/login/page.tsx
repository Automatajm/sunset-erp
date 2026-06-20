"use client";
// FILE: frontend/app/login/page.tsx

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import apiClient from '@/lib/api/client';
import { setAccessToken } from '@/lib/api/token-store';

interface TenantOption { id: string; code: string; name: string; industry?: string; }

type Step = 'credentials' | 'tenant';

export default function LoginPage() {
  const router = useRouter();
  const { login, checkAuth } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  const [step,      setStep]      = useState<Step>('credentials');
  const [tenants,   setTenants]   = useState<TenantOption[]>([]);
  const [tenantQ,   setTenantQ]   = useState('');
  const [tenantSel, setTenantSel] = useState<TenantOption | null>(null);
  const [ddOpen,    setDdOpen]    = useState(false);
  const [tempToken, setTempToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const ddRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ddRef.current && !ddRef.current.contains(e.target as Node)) setDdOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(tenantQ.toLowerCase()) ||
    t.code.toLowerCase().includes(tenantQ.toLowerCase())
  );

  // spec-034 — return to the originally-requested page after login (?next=), or /
  const nextPath = () => {
    if (typeof window === 'undefined') return '/';
    const n = new URLSearchParams(window.location.search).get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/';
  };

  const handleCredentials = async () => {
    if (!email || !password) { setError('Email and password are required.'); return; }
    setLoading(true); setError('');
    try {
      const res  = await apiClient.post('/auth/login', { email, password });
      const data = res.data;
      if (data.requiresTenantSelection && data.tenants?.length > 0) {
        setTempToken(data.access_token ?? '');
        setTenants(data.tenants);
        setStep('tenant');
      } else {
        // spec-034 — access token to memory only; tenant name (display) persists.
        setAccessToken(data.access_token);
        if (data.tenant?.name) localStorage.setItem('tenant_name', data.tenant.name);
        await checkAuth();
        router.push(nextPath());
      }
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Invalid email or password.');
    } finally { setLoading(false); }
  };

  const handleSelectTenant = async () => {
    if (!tenantSel) { setError('Please select a company.'); return; }
    setLoading(true); setError('');
    try {
      const res  = await apiClient.post('/auth/select-tenant',
        { tenantId: tenantSel.id },
        { headers: { Authorization: `Bearer ${tempToken}` } }
      );
      const data = res.data;
      // spec-034 — access token to memory only; tenant name (display) persists.
      setAccessToken(data.access_token);
      localStorage.setItem('tenant_name', tenantSel.name);
      await checkAuth();
      router.push(nextPath());
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to select company.');
    } finally { setLoading(false); }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      step === 'credentials' ? handleCredentials() : handleSelectTenant();
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&family=IBM+Plex+Sans:wght@300;400;500&family=IBM+Plex+Mono:wght@400&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #07050e; }
        .login-root {
          min-height: 100vh;
          background: #07050e;
          background-image:
            radial-gradient(ellipse 70% 50% at 50% 100%, rgba(234,88,12,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 40% 30% at 20% 20%, rgba(124,58,237,0.08) 0%, transparent 50%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'IBM Plex Sans', sans-serif; padding: 24px;
        }
        /* FIX: overflow:visible so dropdown escapes the card.
           Visual border-radius preserved via .login-hdr clip. */
        .login-card {
          width: 100%; max-width: 400px;
          background: rgba(12,8,22,0.95);
          border: 0.5px solid rgba(251,146,60,0.2);
          border-radius: 16px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02) inset;
          backdrop-filter: blur(24px);
          overflow: visible; position: relative;
        }
        .login-card::before {
          content: '';
          position: absolute; top: 0; left: 40px; right: 40px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(251,146,60,0.5), transparent);
          border-radius: 16px 16px 0 0;
        }
        /* Clip header so rounded corners still show at top */
        .login-hdr {
          padding: 32px 32px 24px;
          border-bottom: 0.5px solid rgba(255,255,255,0.05);
          text-align: center;
          border-radius: 16px 16px 0 0;
          overflow: hidden;
        }
        /* Clip body bottom corners */
        .login-body {
          padding: 28px 32px 32px;
          display: flex; flex-direction: column; gap: 16px;
          border-radius: 0 0 16px 16px;
          overflow: visible;
        }
        .login-mark {
          width: 44px; height: 44px; border-radius: 12px; margin: 0 auto 14px;
          background: linear-gradient(145deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));
          box-shadow: 0 4px 20px rgba(234,88,12,0.4);
          display: flex; align-items: center; justify-content: center;
        }
        .login-mark svg { width: 22px; height: 22px; }
        .login-wordmark {
          font-family: 'Cormorant Garamond', serif;
          font-size: 26px; font-weight: 300; letter-spacing: 0.1em; color: var(--white, #fff);
        }
        .login-wordmark span { color: var(--accent-strong, #fb923c); }
        .login-sub { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 4px; letter-spacing: 0.06em; }
        .login-field { display: flex; flex-direction: column; gap: 5px; }
        .login-label {
          font-size: 10px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(251,146,60,0.6);
        }
        .login-input {
          background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 10px 14px; font-size: 13px;
          font-family: 'IBM Plex Sans', sans-serif; color: var(--text-strong, #f1ede8); outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .login-input:focus { border-color: rgba(251,146,60,0.4); box-shadow: 0 0 0 2px rgba(234,88,12,0.1); }
        .login-input::placeholder { color: rgba(255,255,255,0.2); }
        .login-btn {
          padding: 11px; border-radius: 8px; font-size: 13px; font-weight: 500;
          font-family: 'IBM Plex Sans', sans-serif; color: white; border: none; cursor: pointer;
          background: linear-gradient(135deg,#92400e,var(--accent-pressed, #c2410c),var(--accent, #ea580c));
          box-shadow: 0 4px 16px rgba(234,88,12,0.35);
          transition: opacity 0.2s, transform 0.1s;
        }
        .login-btn:hover:not(:disabled) { opacity: 0.92; transform: translateY(-1px); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .login-err {
          background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2);
          border-radius: 7px; padding: 8px 12px; font-size: 12px; color: var(--danger-subtle, #fca5a5);
        }
        .login-step {
          display: flex; align-items: center; gap: 8px;
          font-size: 10px; color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.08em;
        }
        .login-step-dot {
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 600;
        }
        .login-step-line { flex: 1; height: 0.5px; background: rgba(255,255,255,0.08); }

        /* Tenant dropdown — identical look to original */
        .td-trigger {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.1); border-radius: 8px;
          cursor: pointer; transition: border-color 0.2s;
        }
        .td-trigger:hover { border-color: rgba(251,146,60,0.3); }
        .td-trigger-open { border-color: rgba(251,146,60,0.4) !important; box-shadow: 0 0 0 2px rgba(234,88,12,0.1); }
        .td-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 9999;
          background: rgba(12,8,22,0.98); border: 0.5px solid rgba(251,146,60,0.2);
          border-radius: 10px; overflow: hidden;
          box-shadow: 0 16px 48px rgba(0,0,0,0.7);
          animation: dd-in 0.1s ease;
          display: flex; flex-direction: column;
        }
        @keyframes dd-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .td-search { padding: 10px 12px; border-bottom: 0.5px solid rgba(255,255,255,0.06); flex-shrink: 0; }
        .td-list {
          max-height: 220px; overflow-y: auto; overflow-x: hidden;
          padding: 6px; display: flex; flex-direction: column; gap: 2px;
        }
        .td-list::-webkit-scrollbar { width: 4px; }
        .td-list::-webkit-scrollbar-track { background: transparent; }
        .td-list::-webkit-scrollbar-thumb { background: rgba(251,146,60,0.3); border-radius: 4px; }
        .td-list::-webkit-scrollbar-thumb:hover { background: rgba(251,146,60,0.5); }
        .td-item {
          padding: 9px 12px; border-radius: 7px; cursor: pointer;
          transition: background 0.1s, color 0.1s;
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
        }
        .td-item:hover { background: rgba(251,146,60,0.08); }
        .td-item-sel { background: rgba(251,146,60,0.1) !important; }
        .td-empty { padding: 16px 12px; text-align: center; font-size: 12px; color: rgba(255,255,255,0.3); }
      `}</style>

      <div className="login-root" onKeyDown={handleKey}>
        <div className="login-card">
          <div className="login-hdr">
            <div className="login-mark">
              <svg viewBox="0 0 26 26" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13" cy="11" r="4"/>
                <line x1="13" y1="3"   x2="13"   y2="5.5"/>
                <line x1="19.5" y1="6.5" x2="18.2" y2="7.8"/>
                <line x1="22"  y1="13"  x2="19.8" y2="13"/>
                <line x1="6.5" y1="6.5" x2="7.8"  y2="7.8"/>
                <line x1="4"   y1="13"  x2="6.2"  y2="13"/>
                <line x1="4"   y1="19"  x2="22"   y2="19" strokeWidth="2.2"/>
              </svg>
            </div>
            <div className="login-wordmark">Sun<span>set</span> ERP</div>
            <div className="login-sub">Enterprise Resource Planning</div>
          </div>

          <div className="login-body">
            {/* Step indicator */}
            <div className="login-step">
              <div className="login-step-dot" style={{
                background: step === 'credentials' ? 'rgba(251,146,60,0.2)' : 'rgba(74,222,128,0.2)',
                color:      step === 'credentials' ? 'var(--accent-strong, #fb923c)' : 'var(--success, #4ade80)',
                border:     `0.5px solid ${step === 'credentials' ? 'rgba(251,146,60,0.3)' : 'rgba(74,222,128,0.3)'}`,
              }}>
                {step === 'credentials' ? '1' : '✓'}
              </div>
              <span style={{ color: step === 'credentials' ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.3)' }}>Credentials</span>
              <div className="login-step-line" />
              <div className="login-step-dot" style={{
                background: step === 'tenant' ? 'rgba(251,146,60,0.2)' : 'rgba(255,255,255,0.04)',
                color:      step === 'tenant' ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.2)',
                border:     `0.5px solid ${step === 'tenant' ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.08)'}`,
              }}>2</div>
              <span style={{ color: step === 'tenant' ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.25)' }}>Company</span>
            </div>

            {/* Step 1 */}
            {step === 'credentials' && (
              <>
                <div className="login-field">
                  <label className="login-label">Email</label>
                  <input className="login-input" type="email" placeholder="admin@demo.com"
                    value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                </div>
                <div className="login-field">
                  <label className="login-label">Password</label>
                  <input className="login-input" type="password" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                {error && <div className="login-err">{error}</div>}
                <button className="login-btn" onClick={handleCredentials} disabled={loading}>
                  {loading ? 'Verifying...' : 'Continue'}
                </button>
              </>
            )}

            {/* Step 2 */}
            {step === 'tenant' && (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  Your account has access to multiple companies.<br/>
                  Select which one you want to work in.
                </div>

                <div className="login-field" style={{ position: 'relative' }} ref={ddRef}>
                  <label className="login-label">Company</label>
                  <div
                    className={`td-trigger${ddOpen ? ' td-trigger-open' : ''}`}
                    onClick={() => setDdOpen(o => !o)}>
                    {tenantSel ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>{tenantSel.name}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(251,146,60,0.6)' }}>{tenantSel.code}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Search and select company...</span>
                    )}
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{ddOpen ? '▲' : '▼'}</span>
                  </div>

                  {ddOpen && (
                    <div className="td-dropdown">
                      <div className="td-search">
                        <input
                          autoFocus
                          className="login-input"
                          style={{ padding: '7px 10px', fontSize: 12 }}
                          placeholder="Search company name or code..."
                          value={tenantQ}
                          onChange={e => setTenantQ(e.target.value)}
                        />
                      </div>
                      <div className="td-list">
                        {filteredTenants.length === 0 ? (
                          <div className="td-empty">No companies found</div>
                        ) : filteredTenants.map(t => (
                          <div key={t.id}
                            className={`td-item${tenantSel?.id === t.id ? ' td-item-sel' : ''}`}
                            onClick={() => { setTenantSel(t); setDdOpen(false); setTenantQ(''); }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: tenantSel?.id === t.id ? 'var(--accent-strong, #fb923c)' : 'var(--text-primary, #e2dfd8)' }}>{t.name}</div>
                              {t.industry && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{t.industry}</div>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: 'rgba(251,146,60,0.5)', background: 'rgba(251,146,60,0.08)', padding: '1px 6px', borderRadius: 4 }}>{t.code}</span>
                              {tenantSel?.id === t.id && <span style={{ fontSize: 9, color: 'var(--success, #4ade80)' }}>✓ selected</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {error && <div className="login-err">{error}</div>}

                <button className="login-btn" onClick={handleSelectTenant} disabled={loading || !tenantSel}>
                  {loading ? 'Signing in...' : tenantSel ? `Enter ${tenantSel.name}` : 'Select a company to continue'}
                </button>

                <button
                  onClick={() => { setStep('credentials'); setError(''); setTenantSel(null); setTempToken(''); }}
                  style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", textAlign: 'center' }}>
                  ← Back to credentials
                </button>
              </>
            )}

            <div style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.15)', letterSpacing: '0.05em', marginTop: 4 }}>
              Sunset ERP · Powered by Automata JM
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
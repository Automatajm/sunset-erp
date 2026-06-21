"use client";
// FILE: frontend/app/settings/tenants/page.tsx

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import apiClient from '@/lib/api/client';
import { ConfirmModal } from '@/components/ui/modal';

// ── Types ──────────────────────────────────────────────────────────────────
interface TenantUser {
  id: string; email: string; firstName: string; lastName: string;
  fullName: string; status: string; isActive: boolean; isDefault: boolean;
  joinedAt: string; lastLoginAt?: string;
  roles: { id: string; code: string; name: string }[];
}

interface Tenant {
  id: string; code: string; name: string; legalName?: string; taxId?: string;
  country: string; industry?: string; companySize?: string; status: string;
  subscriptionPlan: string; subscriptionStatus?: string;
  defaultCurrency: string; defaultLanguage: string; timezone?: string;
  createdAt: string; userCount: number; users?: TenantUser[];
}

// ── Styles ─────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'rgba(10,7,18,0.7)', border: '0.5px solid rgba(251,146,60,0.12)',
  borderRadius: 10, padding: '16px 18px',
};
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };
const INPUT: React.CSSProperties = {
  background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))',
  borderRadius: 7, padding: '8px 12px', fontSize: 13,
  fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%',
};
const LABEL_S: React.CSSProperties = {
  fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif", marginBottom: 4, display: 'block',
};
const BTN_PRI: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 7, fontSize: 12, fontWeight: 500,
  fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg,#92400e,#d97706,var(--warning, #fbbf24))',
  boxShadow: '0 3px 12px rgba(217,119,6,0.3)',
};
const BTN_SEC: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 7, fontSize: 12,
  fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--w50, rgba(255,255,255,0.5))',
  background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', cursor: 'pointer',
};
const PLAN_COLOR: Record<string, string> = {
  free: 'var(--text-secondary, #6b7280)', starter: 'var(--accent-blue, #60a5fa)', professional: 'var(--accent-violet, #a78bfa)', enterprise: 'var(--accent-mid, #f97316)',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'var(--success, #4ade80)', suspended: 'var(--danger, #f87171)', cancelled: 'var(--text-secondary, #6b7280)',
};

// ── Field components defined OUTSIDE modal to prevent focus loss ───────────

interface FieldProps {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}
function TenantField({ label, value, onChange, placeholder, disabled }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={LABEL_S}>{label}</label>
      <input
        style={{ ...INPUT, opacity: disabled ? 0.5 : 1 }}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
    </div>
  );
}

interface SelectProps {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; l: string }[];
}
function TenantSelect({ label, value, onChange, options }: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={LABEL_S}>{label}</label>
      <SearchSelect options={options.map(o => ({ value: o.v, label: o.l }))} value={value} onChange={onChange} placeholder={label} minWidth={220} />
    </div>
  );
}

// ── Create/Edit Modal ──────────────────────────────────────────────────────
function TenantModal({
  tenant, onClose, onSaved,
}: { tenant: Partial<Tenant> | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!tenant?.id;

  // Individual state per field — prevents focus loss caused by shared object
  const [name,             setName]             = useState(tenant?.name            ?? '');
  const [legalName,        setLegalName]        = useState(tenant?.legalName       ?? '');
  const [taxId,            setTaxId]            = useState(tenant?.taxId           ?? '');
  const [country,          setCountry]          = useState(tenant?.country         ?? 'DO');
  const [industry,         setIndustry]         = useState(tenant?.industry        ?? '');
  const [companySize,      setCompanySize]      = useState(tenant?.companySize      ?? '');
  const [defaultCurrency,  setDefaultCurrency]  = useState(tenant?.defaultCurrency  ?? 'USD');
  const [defaultLanguage,  setDefaultLanguage]  = useState(tenant?.defaultLanguage  ?? 'en-US');
  const [timezone,         setTimezone]         = useState(tenant?.timezone         ?? 'America/Santo_Domingo');
  const [subscriptionPlan, setSubscriptionPlan] = useState(tenant?.subscriptionPlan ?? 'free');
  const [status,           setStatus]           = useState(tenant?.status           ?? 'active');
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');

  const handleSave = async () => {
    if (!name || !country) { setError('Name and Country are required.'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        // code is NOT sent on update — it's immutable and not in UpdateTenantDto
        const updateBody = { name, legalName, taxId, country, industry, companySize, defaultCurrency, defaultLanguage, timezone, subscriptionPlan, status };
        await apiClient.patch(`/tenants/${tenant!.id}`, updateBody);
      } else {
        // code is sent only on create
        const createBody = { name, legalName, taxId, country, industry, companySize, defaultCurrency, defaultLanguage, timezone, subscriptionPlan };
        await apiClient.post('/tenants', createBody);
      }
      onSaved();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface, #0e0b1a)', border: '0.5px solid rgba(251,146,60,0.25)', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.7)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 30, right: 30, height: 1, background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--l06, rgba(255,255,255,0.06))', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>{isEdit ? `Edit Tenant — ${tenant!.name}` : 'New Tenant'}</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--l06, rgba(255,255,255,0.06))', border: 'none', cursor: 'pointer', color: 'var(--w45, rgba(255,255,255,0.45))', fontSize: 16 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={LABEL_S}>Code (auto-generated)</label>
              <input
                style={{ ...INPUT, opacity: 0.45, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.08em' }}
                value={tenant?.code ?? ''}
                disabled
                readOnly
              />
            </div>
          )}
          <TenantField label="Name *" value={name} onChange={setName} placeholder="Acme Manufacturing LLC" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TenantField label="Legal Name"   value={legalName} onChange={setLegalName} placeholder="Acme Mfg S.A.S." />
            <TenantField label="Tax ID / RNC" value={taxId}     onChange={setTaxId}     placeholder="101-234567-8" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <TenantField label="Country *" value={country}  onChange={setCountry}  placeholder="DO" />
            <TenantField label="Industry"  value={industry} onChange={setIndustry} placeholder="Manufacturing" />
            <TenantSelect label="Company Size" value={companySize} onChange={setCompanySize} options={[
              { v: '', l: '—' }, { v: '1-10', l: '1–10' }, { v: '11-50', l: '11–50' },
              { v: '50-200', l: '50–200' }, { v: '200-500', l: '200–500' }, { v: '500+', l: '500+' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <TenantField label="Currency" value={defaultCurrency} onChange={setDefaultCurrency} placeholder="USD" />
            <TenantField label="Language" value={defaultLanguage} onChange={setDefaultLanguage} placeholder="en-US" />
            <TenantField label="Timezone" value={timezone}        onChange={setTimezone}        placeholder="America/Santo_Domingo" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TenantSelect label="Plan" value={subscriptionPlan} onChange={setSubscriptionPlan} options={[
              { v: 'free', l: 'Free' }, { v: 'starter', l: 'Starter' },
              { v: 'professional', l: 'Professional' }, { v: 'enterprise', l: 'Enterprise' },
            ]} />
            {isEdit && (
              <TenantSelect label="Status" value={status} onChange={setStatus} options={[
                { v: 'active', l: 'Active' }, { v: 'suspended', l: 'Suspended' }, { v: 'cancelled', l: 'Cancelled' },
              ]} />
            )}
          </div>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px', borderTop: '0.5px solid var(--l06, rgba(255,255,255,0.06))', flexShrink: 0 }}>
          <button style={BTN_SEC} onClick={onClose}>Cancel</button>
          <button style={BTN_PRI} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Tenant'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add User Modal ─────────────────────────────────────────────────────────
function AddUserModal({
  tenantId, onClose, onAdded,
}: { tenantId: string; onClose: () => void; onAdded: () => void }) {
  const [search,  setSearch]  = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding,  setAdding]  = useState<string | null>(null);
  const [error,   setError]   = useState('');

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await apiClient.get('/users', { params: { search: q } });
      setResults(res.data.users ?? []);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 300);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  const handleAdd = async (userId: string) => {
    setAdding(userId); setError('');
    try {
      await apiClient.post(`/tenants/${tenantId}/users`, { userId });
      onAdded();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to add user');
    } finally { setAdding(null); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface, #0e0b1a)', border: '0.5px solid rgba(96,165,250,0.25)', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '0.5px solid var(--l06, rgba(255,255,255,0.06))' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>Add User to Tenant</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--l06, rgba(255,255,255,0.06))', border: 'none', cursor: 'pointer', color: 'var(--w45, rgba(255,255,255,0.45))', fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            style={INPUT}
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {loading && <div style={{ fontSize: 12, color: 'var(--w30, rgba(255,255,255,0.3))', textAlign: 'center' }}>Searching...</div>}
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
              {results.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--l03, rgba(255,255,255,0.03))', borderRadius: 7, border: '0.5px solid var(--l06, rgba(255,255,255,0.06))' }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary, #e2dfd8)' }}>{u.firstName} {u.lastName}</div>
                    <div style={{ ...MONO, color: 'var(--w35, rgba(255,255,255,0.35))', marginTop: 2 }}>{u.email}</div>
                  </div>
                  <button
                    onClick={() => handleAdd(u.id)}
                    disabled={adding === u.id}
                    style={{ ...BTN_PRI, padding: '5px 14px', fontSize: 11, opacity: adding === u.id ? 0.5 : 1 }}>
                    {adding === u.id ? '...' : '+ Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {search && !loading && results.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--w30, rgba(255,255,255,0.3))', textAlign: 'center', padding: '12px 0' }}>
              No users found. Create the user first in Settings → Users.
            </div>
          )}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function TenantsPage() {
  const [tenants,    setTenants]    = useState<Tenant[]>([]);
  const [selected,   setSelected]   = useState<Tenant | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [detailLoad, setDetailLoad] = useState(false);
  const [modal,      setModal]      = useState<'create' | 'edit' | null>(null);
  const [addUser,    setAddUser]    = useState(false);
  const [search,     setSearch]     = useState('');
  // spec-frontend-002/003 — removing a user from a tenant was unguarded.
  const [removeUser, setRemoveUser] = useState<{ id: string; fullName: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/tenants');
      // spec-027 envelope { tenants, count }; tolerate legacy bare array
      setTenants(Array.isArray(res.data) ? res.data : (res.data?.tenants ?? []));
    } catch { setTenants([]); }
    finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoad(true);
    try {
      const res = await apiClient.get(`/tenants/${id}`);
      setSelected(res.data);
    } catch {}
    finally { setDetailLoad(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRemoveUser = async (userId: string) => {
    if (!selected) return;
    await apiClient.delete(`/tenants/${selected.id}/users/${userId}`);
    loadDetail(selected.id);
  };

  const handleToggleDefault = async (tenantId: string, userId: string, isDefault: boolean) => {
    try {
      await apiClient.patch(`/tenants/${tenantId}/users/${userId}/set-default`, { unset: isDefault });
      loadDetail(tenantId);
    } catch {}
  };

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'Tenants']} title="Tenant Management">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .tm-layout { display:grid; grid-template-columns:340px 1fr; gap:0; height:100%; overflow:hidden; }
        .tm-list { border-right:0.5px solid var(--l06, rgba(255,255,255,0.06)); display:flex; flex-direction:column; overflow:hidden; }
        .tm-list-hdr { padding:12px 16px; border-bottom:0.5px solid var(--l06, rgba(255,255,255,0.06)); display:flex; flex-direction:column; gap:8px; flex-shrink:0; }
        .tm-list-body { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:4px; }
        .tm-row { padding:10px 12px; border-radius:8px; border:0.5px solid transparent; cursor:pointer; transition:all 0.15s; }
        .tm-row:hover { background:var(--l04, rgba(255,255,255,0.04)); border-color:var(--l06, rgba(255,255,255,0.06)); }
        .tm-row-active { background:rgba(251,146,60,0.08)!important; border-color:rgba(251,146,60,0.2)!important; }
        .tm-detail { display:flex; flex-direction:column; overflow-y:auto; padding:16px 20px; gap:16px; }
        .tm-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:20px; font-size:10px; font-weight:500; }
        .tm-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:8px; color:var(--w20, rgba(255,255,255,0.2)); font-size:13px; }
      `}</style>

      {modal && (
        <TenantModal
          tenant={modal === 'edit' ? selected : {}}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); if (selected) loadDetail(selected.id); }}
        />
      )}
      {addUser && selected && (
        <AddUserModal
          tenantId={selected.id}
          onClose={() => setAddUser(false)}
          onAdded={() => { setAddUser(false); loadDetail(selected.id); }}
        />
      )}

      <div style={{ padding: '0 18px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => window.history.back()} style={{ ...BTN_SEC, fontSize: 11 }}>← Back</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => setModal('create')} style={BTN_PRI}>+ New Tenant</button>
      </div>

      <div className="tm-layout">
        {/* ── List ── */}
        <div className="tm-list">
          <div className="tm-list-hdr">
            <input
              style={{ ...INPUT, padding: '7px 10px', fontSize: 12 }}
              placeholder="Search tenants..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div style={{ fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {filtered.length} tenant{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="tm-list-body">
            {loading ? (
              <div className="tm-empty">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="tm-empty">No tenants found</div>
            ) : filtered.map(t => (
              <div
                key={t.id}
                className={`tm-row${selected?.id === t.id ? ' tm-row-active' : ''}`}
                onClick={() => loadDetail(t.id)}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: selected?.id === t.id ? 'var(--accent-strong, #fb923c)' : 'var(--text-primary, #e2dfd8)' }}>{t.name}</span>
                  <span className="tm-badge" style={{ background: `${STATUS_COLOR[t.status] ?? 'var(--text-secondary, #6b7280)'}18`, color: STATUS_COLOR[t.status] ?? 'var(--text-secondary, #6b7280)', border: `0.5px solid ${STATUS_COLOR[t.status] ?? 'var(--text-secondary, #6b7280)'}30` }}>{t.status}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...MONO, fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))' }}>{t.code}</span>
                  <span style={{ fontSize: 10, color: 'var(--w20, rgba(255,255,255,0.2))' }}>·</span>
                  <span className="tm-badge" style={{ background: `${PLAN_COLOR[t.subscriptionPlan] ?? 'var(--text-secondary, #6b7280)'}18`, color: PLAN_COLOR[t.subscriptionPlan] ?? 'var(--text-secondary, #6b7280)', border: `0.5px solid ${PLAN_COLOR[t.subscriptionPlan] ?? 'var(--text-secondary, #6b7280)'}30`, padding: '1px 6px' }}>{t.subscriptionPlan}</span>
                  <span style={{ fontSize: 10, color: 'var(--w20, rgba(255,255,255,0.2))', marginLeft: 'auto' }}>{t.userCount} user{t.userCount !== 1 ? 's' : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Detail ── */}
        <div className="tm-detail">
          {!selected ? (
            <div className="tm-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><line x1="9" y1="9" x2="9" y2="9.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="9" y1="15" x2="9" y2="15.01"/></svg>
              <span>Select a tenant to view details</span>
            </div>
          ) : detailLoad ? (
            <div className="tm-empty">Loading...</div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-strong, #f1ede8)', marginBottom: 4 }}>{selected.name}</div>
                  {selected.legalName && <div style={{ fontSize: 12, color: 'var(--w40, rgba(255,255,255,0.4))', marginBottom: 4 }}>{selected.legalName}</div>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="tm-badge" style={{ background: 'var(--l05, rgba(255,255,255,0.05))', color: 'var(--w40, rgba(255,255,255,0.4))', border: '0.5px solid var(--l08, rgba(255,255,255,0.08))' }}>{selected.code}</span>
                    <span className="tm-badge" style={{ background: `${STATUS_COLOR[selected.status] ?? 'var(--text-secondary, #6b7280)'}18`, color: STATUS_COLOR[selected.status] ?? 'var(--text-secondary, #6b7280)', border: `0.5px solid ${STATUS_COLOR[selected.status] ?? 'var(--text-secondary, #6b7280)'}30` }}>{selected.status}</span>
                    <span className="tm-badge" style={{ background: `${PLAN_COLOR[selected.subscriptionPlan] ?? 'var(--text-secondary, #6b7280)'}18`, color: PLAN_COLOR[selected.subscriptionPlan] ?? 'var(--text-secondary, #6b7280)', border: `0.5px solid ${PLAN_COLOR[selected.subscriptionPlan] ?? 'var(--text-secondary, #6b7280)'}30` }}>{selected.subscriptionPlan}</span>
                    <span className="tm-badge" style={{ background: 'var(--l04, rgba(255,255,255,0.04))', color: 'var(--w30, rgba(255,255,255,0.3))', border: '0.5px solid var(--l08, rgba(255,255,255,0.08))' }}>{selected.country} · {selected.defaultCurrency}</span>
                  </div>
                </div>
                <button onClick={() => setModal('edit')} style={BTN_SEC}>Edit</button>
              </div>

              {/* Info grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[
                  { label: 'Industry', value: selected.industry       ?? '—' },
                  { label: 'Size',     value: selected.companySize     ?? '—' },
                  { label: 'Language', value: selected.defaultLanguage },
                  { label: 'Timezone', value: selected.timezone        ?? 'UTC' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--l03, rgba(255,255,255,0.03))', border: '0.5px solid var(--l06, rgba(255,255,255,0.06))', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, color: 'var(--w30, rgba(255,255,255,0.3))', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary, #e2dfd8)' }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Users */}
              <div style={CARD}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' }}>
                    Users — {selected.users?.length ?? 0}
                  </div>
                  <button onClick={() => setAddUser(true)} style={{ ...BTN_SEC, fontSize: 11, padding: '5px 12px' }}>+ Add User</button>
                </div>

                {!selected.users?.length ? (
                  <div style={{ fontSize: 12, color: 'var(--w30, rgba(255,255,255,0.3))', textAlign: 'center', padding: '20px 0' }}>No users in this tenant</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selected.users.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--l02, rgba(255,255,255,0.02))', borderRadius: 7, border: '0.5px solid var(--l05, rgba(255,255,255,0.05))' }}>
                        {/* Avatar */}
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: u.isActive ? 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent-mid, #f97316))' : 'var(--w10, rgba(255,255,255,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'white', flexShrink: 0 }}>
                          {u.firstName.charAt(0)}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{u.fullName}</span>
                            {u.isDefault && (
                              <span
                                className="tm-badge"
                                title="This tenant is the default for this user — they log in here automatically"
                                style={{ background: 'rgba(251,146,60,0.1)', color: 'var(--accent-strong, #fb923c)', border: '0.5px solid rgba(251,146,60,0.25)', fontSize: 9, cursor: 'help' }}>
                                MY DEFAULT
                              </span>
                            )}
                            {!u.isActive && (
                              <span className="tm-badge" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--danger, #f87171)', border: '0.5px solid rgba(248,113,113,0.25)', fontSize: 9 }}>INACTIVE</span>
                            )}
                          </div>
                          <div style={{ ...MONO, fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))', marginTop: 1 }}>{u.email}</div>
                          {u.roles.length > 0 && (
                            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                              {u.roles.map(r => (
                                <span key={r.id} className="tm-badge" style={{ background: 'rgba(167,139,250,0.1)', color: 'var(--accent-violet, #a78bfa)', border: '0.5px solid rgba(167,139,250,0.2)', fontSize: 9 }}>{r.name}</span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => handleToggleDefault(selected.id, u.id, u.isDefault)}
                            title={u.isDefault ? 'Remove as default tenant for this user' : 'Set as default tenant for this user'}
                            style={{
                              fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                              fontFamily: "'IBM Plex Sans',sans-serif",
                              background: u.isDefault ? 'rgba(107,114,128,0.08)' : 'rgba(251,146,60,0.08)',
                              border: u.isDefault ? '0.5px solid rgba(107,114,128,0.25)' : '0.5px solid rgba(251,146,60,0.2)',
                              color: u.isDefault ? 'var(--text-secondary, #6b7280)' : 'var(--accent-strong, #fb923c)',
                            }}>
                            {u.isDefault ? 'Unset Default' : 'Set Default'}
                          </button>
                          <button
                            onClick={() => setRemoveUser({ id: u.id, fullName: u.fullName })}
                            style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', color: 'var(--danger, #f87171)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={removeUser !== null}
        onClose={() => setRemoveUser(null)}
        title={removeUser ? `Remove ${removeUser.fullName} from this tenant?` : ''}
        description="The user loses access to this tenant. It cannot be undone."
        variant="destructive"
        confirmLabel="Remove User"
        onConfirm={async () => { if (removeUser) await handleRemoveUser(removeUser.id); }}
      />
    </ERPShell>
  );
}
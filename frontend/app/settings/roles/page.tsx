"use client";

import { useEffect, useState, useCallback } from 'react';
import apiClient from '@/lib/api/client';

// ---- Types ------------------------------------------------------------------

interface Permission { id: string; code: string; name: string; module: string; }
interface Role {
  id: string; code: string; name: string; description: string | null;
  isSystem: boolean; userCount: number; createdAt: string;
  permissions: Permission[];
}

// ---- Styles -----------------------------------------------------------------
const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: '#e2dfd8', outline: 'none', width: '100%', boxSizing: 'border-box' as const };
const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' };
const BTN = (variant: 'primary'|'ghost'|'danger' = 'ghost'): React.CSSProperties => ({
  border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
  background: variant === 'primary' ? 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)'
    : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
  color: variant === 'primary' ? 'white' : variant === 'danger' ? '#f87171' : 'rgba(255,255,255,0.6)',
  outline: variant === 'danger' ? '0.5px solid rgba(239,68,68,0.2)' : 'none',
});

const MODULE_COLOR: Record<string, string> = {
  inventory:   '#60a5fa',
  procurement: '#fb923c',
  sales:       '#4ade80',
  accounting:  '#a78bfa',
  admin:       '#f87171',
};

// ---- Role Modal ------------------------------------------------------------

function RoleModal({ role, allPermissions, grouped, onClose, onSaved }: {
  role: Role | null;
  allPermissions: Permission[];
  grouped: Record<string, Permission[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!role;
  const [form, setForm] = useState({
    code:        role?.code        ?? '',
    name:        role?.name        ?? '',
    description: role?.description ?? '',
    permissionIds: role?.permissions.map(p => p.id) ?? [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  function togglePerm(id: string) {
    setForm(f => ({
      ...f,
      permissionIds: f.permissionIds.includes(id)
        ? f.permissionIds.filter(p => p !== id)
        : [...f.permissionIds, id],
    }));
  }

  function toggleModule(module: string) {
    const modulePerms = (grouped[module] ?? []).map(p => p.id);
    const allSelected = modulePerms.every(id => form.permissionIds.includes(id));
    setForm(f => ({
      ...f,
      permissionIds: allSelected
        ? f.permissionIds.filter(id => !modulePerms.includes(id))
        : [...new Set([...f.permissionIds, ...modulePerms])],
    }));
  }

  async function handleSubmit() {
    if (!form.name) { setError('Name is required'); return; }
    if (!isEdit && !form.code) { setError('Code is required'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await apiClient.patch(`/roles/${role!.id}`, { name: form.name, description: form.description });
        await apiClient.patch(`/roles/${role!.id}/permissions`, { permissionIds: form.permissionIds });
      } else {
        await apiClient.post('/roles', { ...form });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0a0712', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e2dfd8' }}>{isEdit ? `Edit Role — ${role!.name}` : 'New Role'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }}>x</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr' : '1fr 1fr', gap: 12 }}>
            {!isEdit && (
              <div>
                <label style={LBL}>Code</label>
                <input style={{ ...INP, fontFamily: "'IBM Plex Mono',monospace", textTransform: 'uppercase' as const }} value={form.code} onChange={e => setForm(f => ({...f, code: e.target.value.toUpperCase()}))} placeholder="WAREHOUSE_SUPERVISOR" />
              </div>
            )}
            <div>
              <label style={LBL}>Name</label>
              <input style={INP} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Warehouse Supervisor" disabled={role?.isSystem} />
            </div>
          </div>
          <div>
            <label style={LBL}>Description</label>
            <input style={INP} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Optional description" disabled={role?.isSystem} />
          </div>

          {/* Permissions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ ...LBL, marginBottom: 0 }}>Permissions ({form.permissionIds.length} selected)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setForm(f => ({...f, permissionIds: allPermissions.map(p => p.id)}))} style={{ fontSize: 10, color: '#fb923c', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
                <button onClick={() => setForm(f => ({...f, permissionIds: []}))} style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
              </div>
            </div>

            {/* Permissions grouped by module */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(grouped).map(([module, perms]) => {
                const moduleColor  = MODULE_COLOR[module] ?? '#e2dfd8';
                const allSelected  = perms.every(p => form.permissionIds.includes(p.id));
                const someSelected = perms.some(p => form.permissionIds.includes(p.id));
                return (
                  <div key={module} style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, overflow: 'hidden' }}>
                    {/* Module header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }} onClick={() => toggleModule(module)}>
                      <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={() => toggleModule(module)} style={{ accentColor: moduleColor }} />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: moduleColor }}>{module}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>{perms.filter(p => form.permissionIds.includes(p.id)).length}/{perms.length}</span>
                    </div>
                    {/* Permission items */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
                      {perms.map(perm => {
                        const selected = form.permissionIds.includes(perm.id);
                        return (
                          <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: selected ? `${moduleColor}18` : 'rgba(255,255,255,0.03)', border: `0.5px solid ${selected ? `${moduleColor}40` : 'rgba(255,255,255,0.08)'}` }}>
                            <input type="checkbox" checked={selected} onChange={() => togglePerm(perm.id)} style={{ accentColor: moduleColor }} />
                            <span style={{ fontSize: 11, color: selected ? moduleColor : 'rgba(255,255,255,0.5)', fontFamily: "'IBM Plex Mono',monospace" }}>{perm.code.split(':')[1]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={BTN('ghost')}>Cancel</button>
          {!role?.isSystem && (
            <button onClick={handleSubmit} disabled={saving} style={BTN('primary')}>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Role'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Page --------------------------------------------------------------

export default function RolesPage() {
  const [roles,      setRoles]      = useState<Role[]>([]);
  const [allPerms,   setAllPerms]   = useState<Permission[]>([]);
  const [grouped,    setGrouped]    = useState<Record<string, Permission[]>>({});
  const [loading,    setLoading]    = useState(true);
  const [editRole,   setEditRole]   = useState<Role | null | 'new'>(null);
  const [error,      setError]      = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        apiClient.get('/roles'),
        apiClient.get('/roles/permissions'),
      ]);
      setRoles(rolesRes.data?.roles ?? []);
      setAllPerms(permsRes.data?.permissions ?? []);
      setGrouped(permsRes.data?.grouped ?? {});
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(role: Role) {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/roles/${role.id}`);
      await load();
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Delete failed'); }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#06040f', color: '#e2dfd8', fontFamily: "'IBM Plex Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}><button onClick={() => window.history.back()} style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "IBM Plex Sans,sans-serif" }}>Back</button><div style={{ fontSize: 20, fontWeight: 700 }}>Roles & Permissions</div></div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Define what each role can access in the system</div>
        </div>
        <button onClick={() => setEditRole('new')} style={BTN('primary')}>+ New Role</button>
      </div>

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>Loading...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {roles.map(role => (
              <div key={role.id} style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Role header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#e2dfd8' }}>{role.name}</span>
                      {role.isSystem && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(96,165,250,0.1)', color: '#60a5fa', border: '0.5px solid rgba(96,165,250,0.2)' }}>SYSTEM</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>{role.code}</div>
                    {role.description && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{role.description}</div>}
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>{role.userCount} user{role.userCount !== 1 ? 's' : ''}</span>
                </div>

                {/* Permission summary by module */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(
                    role.permissions.reduce((acc, p) => {
                      if (!acc[p.module]) acc[p.module] = 0;
                      acc[p.module]++;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([mod, count]) => (
                    <span key={mod} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${MODULE_COLOR[mod] ?? '#e2dfd8'}15`, color: MODULE_COLOR[mod] ?? '#e2dfd8', border: `0.5px solid ${MODULE_COLOR[mod] ?? '#e2dfd8'}30` }}>
                      {mod} ({count})
                    </span>
                  ))}
                  {role.permissions.length === 0 && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>No permissions assigned</span>}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={() => setEditRole(role)} style={{ ...BTN('ghost'), flex: 1, padding: '6px 0', fontSize: 11 }}>
                    {role.isSystem ? 'View' : 'Edit'}
                  </button>
                  {!role.isSystem && (
                    <button onClick={() => handleDelete(role)} style={{ ...BTN('danger'), padding: '6px 10px', fontSize: 11 }}>Delete</button>
                  )}
                </div>
              </div>
            ))}
            {roles.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                No roles yet. Create your first role to control access.
              </div>
            )}
          </div>
        )}
      </div>

      {editRole !== null && (
        <RoleModal
          role={editRole === 'new' ? null : editRole}
          allPermissions={allPerms}
          grouped={grouped}
          onClose={() => setEditRole(null)}
          onSaved={() => { setEditRole(null); load(); }}
        />
      )}
    </div>
  );
}
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import apiClient from '@/lib/api/client';
import { ConfirmModal } from '@/components/ui/modal';

// ---- Types ------------------------------------------------------------------

interface Permission { id: string; code: string; name: string; module: string; }
interface Role {
  id: string; code: string; name: string; description: string | null;
  isSystem: boolean; userCount: number; createdAt: string;
  permissions: Permission[];
}

// ---- Styles -----------------------------------------------------------------
const INP: React.CSSProperties = { background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w12, rgba(255,255,255,0.12))', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: '100%', boxSizing: 'border-box' as const };
const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--w35, rgba(255,255,255,0.35))', marginBottom: 5, display: 'block' };
const BTN = (variant: 'primary'|'ghost'|'danger' = 'ghost'): React.CSSProperties => ({
  border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
  background: variant === 'primary' ? 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))'
    : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'var(--l06, rgba(255,255,255,0.06))',
  color: variant === 'primary' ? 'white' : variant === 'danger' ? 'var(--danger, #f87171)' : 'var(--w60, rgba(255,255,255,0.6))',
  outline: variant === 'danger' ? '0.5px solid rgba(239,68,68,0.2)' : 'none',
});

const MODULE_COLOR: Record<string, string> = {
  inventory:   'var(--accent-blue, #60a5fa)',
  procurement: 'var(--accent-strong, #fb923c)',
  sales:       'var(--success, #4ade80)',
  accounting:  'var(--accent-violet, #a78bfa)',
  admin:       'var(--danger, #f87171)',
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
      <div style={{ background: 'var(--bg, #0a0712)', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--l07, rgba(255,255,255,0.07))', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #e2dfd8)' }}>{isEdit ? `Edit Role — ${role!.name}` : 'New Role'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--w40, rgba(255,255,255,0.4))', cursor: 'pointer', fontSize: 18 }}>x</button>
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
                <button onClick={() => setForm(f => ({...f, permissionIds: allPermissions.map(p => p.id)}))} style={{ fontSize: 10, color: 'var(--accent-strong, #fb923c)', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
                <button onClick={() => setForm(f => ({...f, permissionIds: []}))} style={{ fontSize: 10, color: 'var(--w35, rgba(255,255,255,0.35))', background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
              </div>
            </div>

            {/* Permissions grouped by module */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(grouped).map(([module, perms]) => {
                const moduleColor  = MODULE_COLOR[module] ?? 'var(--text-primary, #e2dfd8)';
                const allSelected  = perms.every(p => form.permissionIds.includes(p.id));
                const someSelected = perms.some(p => form.permissionIds.includes(p.id));
                return (
                  <div key={module} style={{ background: 'var(--l02, rgba(255,255,255,0.02))', border: '0.5px solid var(--l07, rgba(255,255,255,0.07))', borderRadius: 8, overflow: 'hidden' }}>
                    {/* Module header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--l02, rgba(255,255,255,0.02))', cursor: 'pointer' }} onClick={() => toggleModule(module)}>
                      <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }} onChange={() => toggleModule(module)} style={{ accentColor: moduleColor }} />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: moduleColor }}>{module}</span>
                      <span style={{ fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))', marginLeft: 'auto' }}>{perms.filter(p => form.permissionIds.includes(p.id)).length}/{perms.length}</span>
                    </div>
                    {/* Permission items */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
                      {perms.map(perm => {
                        const selected = form.permissionIds.includes(perm.id);
                        return (
                          <label key={perm.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', background: selected ? `color-mix(in srgb, ${moduleColor} 9%, transparent)` : 'var(--l03, rgba(255,255,255,0.03))', border: `0.5px solid ${selected ? `color-mix(in srgb, ${moduleColor} 25%, transparent)` : 'var(--l08, rgba(255,255,255,0.08))'}` }}>
                            <input type="checkbox" checked={selected} onChange={() => togglePerm(perm.id)} style={{ accentColor: moduleColor }} />
                            <span style={{ fontSize: 11, color: selected ? moduleColor : 'var(--w50, rgba(255,255,255,0.5))', fontFamily: "'IBM Plex Mono',monospace" }}>{perm.code.split(':')[1]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--l07, rgba(255,255,255,0.07))', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
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

  // spec-frontend-002/003 — native confirm() replaced by the shared ConfirmModal.
  async function handleDelete(role: Role) {
    await apiClient.delete(`/roles/${role.id}`);
    await load();
  }

  const moduleChips = (role: Role) => Object.entries(
    role.permissions.reduce((acc, p) => { acc[p.module] = (acc[p.module] ?? 0) + 1; return acc; }, {} as Record<string, number>),
  );

  const filterDefs = useMemo<ERPFilter<Role>[]>(() => [
    {
      key: 'search', label: 'Search', type: 'search', placeholder: 'Search name or code…',
      filterFn: (row, val) => { const q = String(val).toLowerCase(); return row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q); },
    },
    { key: 'isSystem', label: 'System only', type: 'boolean', placeholder: 'System only', filterFn: (row, val) => val === true ? row.isSystem : true },
  ], []);
  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(roles, filterDefs, filterVals), [roles, filterDefs, filterVals]);

  const columns = useMemo<ERPColumn<Role>[]>(() => [
    {
      key: 'name', header: 'Name', sortable: true, value: r => r.name,
      render: r => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary, #e2dfd8)' }}>{r.name}</span>
          {r.isSystem && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(96,165,250,0.1)', color: 'var(--accent-blue, #60a5fa)', border: '0.5px solid rgba(96,165,250,0.2)' }}>SYSTEM</span>}
        </div>
      ),
    },
    { key: 'code', header: 'Code', width: 200, sortable: true, value: r => r.code, render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: 'var(--w45, rgba(255,255,255,0.45))' }}>{r.code}</span> },
    {
      key: 'permissions', header: 'Permissions', sortable: false,
      render: r => {
        const chips = moduleChips(r);
        if (chips.length === 0) return <span style={{ fontSize: 11, color: 'var(--w25, rgba(255,255,255,0.25))' }}>None</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {chips.map(([mod, count]) => {
              const c = MODULE_COLOR[mod] ?? 'var(--text-primary, #e2dfd8)';
              return <span key={mod} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `color-mix(in srgb, ${c} 8%, transparent)`, color: c, border: `0.5px solid color-mix(in srgb, ${c} 19%, transparent)` }}>{mod} ({count})</span>;
            })}
          </div>
        );
      },
    },
    { key: 'userCount', header: 'Users', width: 90, align: 'center', sortable: true, value: r => r.userCount, render: r => <span style={{ fontSize: 12, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{r.userCount}</span> },
    {
      key: '_actions', header: '', width: 150, sortable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setEditRole(r)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', color: 'var(--w55, rgba(255,255,255,0.55))', fontFamily: "'IBM Plex Sans',sans-serif" }}>{r.isSystem ? 'View' : 'Edit'}</button>
          {!r.isSystem && <button onClick={() => setDeleteRole(r)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Delete</button>}
        </div>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'Roles']} title="Roles & Permissions">
      <style>{`
        .roles-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .roles-err{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:12px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
      `}</style>
      <div className="roles-page">
        {error && <div className="roles-err">{error}</div>}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => setEditRole('new')} style={{ ...BTN('primary'), flexShrink: 0, alignSelf: 'flex-end' }}>+ New Role</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<Role>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="roles"
            emptyMessage={filterCount ? 'No roles match your filters.' : 'No roles yet. Create your first role to control access.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
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

      <ConfirmModal
        open={deleteRole !== null}
        onClose={() => setDeleteRole(null)}
        title={deleteRole ? `Delete role "${deleteRole.name}"?` : ''}
        description="Members of this role lose its permissions. It cannot be undone."
        variant="destructive"
        confirmLabel="Delete Role"
        onConfirm={async () => { if (deleteRole) await handleDelete(deleteRole); }}
      />
    </ERPShell>
  );
}
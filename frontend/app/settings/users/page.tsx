"use client";

import { useEffect, useState, useCallback } from 'react';
import apiClient from '@/lib/api/client';
import { ConfirmModal } from '@/components/ui/modal';

// ---- Types ------------------------------------------------------------------

interface Role { id: string; code: string; name: string; }
interface User {
  id: string; email: string; firstName: string; lastName: string;
  fullName: string; status: string; isActive: boolean;
  lastLoginAt: string | null; createdAt: string;
  roles: Role[];
}

// ---- Styles -----------------------------------------------------------------
const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: '100%', boxSizing: 'border-box' as const };
const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 5, display: 'block' };
const BTN = (variant: 'primary'|'ghost'|'danger' = 'ghost'): React.CSSProperties => ({
  border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
  background: variant === 'primary' ? 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))'
    : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
  color: variant === 'primary' ? 'white' : variant === 'danger' ? 'var(--danger, #f87171)' : 'rgba(255,255,255,0.6)',
  outline: variant === 'danger' ? '0.5px solid rgba(239,68,68,0.2)' : 'none',
});

// ---- Create/Edit User Modal -------------------------------------------------

function UserModal({ user, roles, onClose, onSaved }: {
  user: User | null; roles: Role[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName:  user?.lastName  ?? '',
    email:     user?.email     ?? '',
    password:  '',
    phone:     '',
    roleIds:   user?.roles.map(r => r.id) ?? [] as string[],
  });
  const [saving, setSaving]   = useState(false);
  const [error,  setError]    = useState('');

  function toggleRole(id: string) {
    setForm(f => ({
      ...f,
      roleIds: f.roleIds.includes(id) ? f.roleIds.filter(r => r !== id) : [...f.roleIds, id],
    }));
  }

  async function handleSubmit() {
    if (!form.firstName || !form.lastName || !form.email) { setError('Name and email are required'); return; }
    if (!isEdit && !form.password) { setError('Password is required for new users'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) {
        await apiClient.patch(`/users/${user!.id}`, { firstName: form.firstName, lastName: form.lastName });
        await apiClient.patch(`/users/${user!.id}/roles`, { roleIds: form.roleIds });
      } else {
        await apiClient.post('/users', { ...form });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg, #0a0712)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #e2dfd8)' }}>{isEdit ? 'Edit User' : 'New User'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }}>x</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LBL}>First Name</label>
              <input style={INP} value={form.firstName} onChange={e => setForm(f => ({...f, firstName: e.target.value}))} placeholder="Juan" />
            </div>
            <div>
              <label style={LBL}>Last Name</label>
              <input style={INP} value={form.lastName} onChange={e => setForm(f => ({...f, lastName: e.target.value}))} placeholder="Rivera" />
            </div>
          </div>
          <div>
            <label style={LBL}>Email</label>
            <input style={INP} type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} placeholder="user@company.com" disabled={isEdit} />
          </div>
          {!isEdit && (
            <div>
              <label style={LBL}>Password</label>
              <input style={INP} type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="Minimum 8 characters" />
            </div>
          )}
          <div>
            <label style={LBL}>Roles ({form.roleIds.length} selected)</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {roles.map(role => (
                <label key={role.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: form.roleIds.includes(role.id) ? 'rgba(251,146,60,0.08)' : 'rgba(255,255,255,0.02)', border: `0.5px solid ${form.roleIds.includes(role.id) ? 'rgba(251,146,60,0.25)' : 'rgba(255,255,255,0.07)'}` }}>
                  <input type="checkbox" checked={form.roleIds.includes(role.id)} onChange={() => toggleRole(role.id)} style={{ accentColor: 'var(--accent-strong, #fb923c)' }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: form.roleIds.includes(role.id) ? 'var(--accent-strong, #fb923c)' : 'var(--text-primary, #e2dfd8)' }}>{role.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono',monospace" }}>{role.code}</div>
                  </div>
                </label>
              ))}
              {roles.length === 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '8px 0' }}>No roles created yet. Create roles first.</div>}
            </div>
          </div>
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={BTN('ghost')}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={BTN('primary')}>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- Reset Password Modal ---------------------------------------------------

function ResetPasswordModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function handleSubmit() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setSaving(true); setError('');
    try {
      await apiClient.patch(`/users/${user.id}/reset-password`, { newPassword: password });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Reset failed');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg, #0a0712)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary, #e2dfd8)' }}>Reset Password</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }}>x</button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Setting new password for <strong style={{ color: 'var(--accent-strong, #fb923c)' }}>{user.fullName}</strong></div>
          <div>
            <label style={LBL}>New Password</label>
            <input style={INP} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" autoFocus />
          </div>
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={BTN('ghost')}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={BTN('primary')}>{saving ? 'Resetting...' : 'Reset Password'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page --------------------------------------------------------------

export default function UsersPage() {
  const [users,       setUsers]       = useState<User[]>([]);
  const [roles,       setRoles]       = useState<Role[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [editUser,    setEditUser]    = useState<User | null | 'new'>( null);
  const [resetUser,   setResetUser]   = useState<User | null>(null);
  // spec-frontend-002/003 — deactivating a user was unguarded.
  const [disableUser, setDisableUser] = useState<User | null>(null);
  const [error,       setError]       = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        apiClient.get('/users'),
        apiClient.get('/roles'),
      ]);
      setUsers(usersRes.data?.users ?? []);
      setRoles(rolesRes.data?.roles ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runToggle(user: User) {
    await apiClient.patch(`/users/${user.id}/${user.isActive ? 'deactivate' : 'activate'}`);
    await load();
  }

  function toggleActive(user: User) {
    // Deactivation is destructive — guard it; activation is restorative — direct.
    if (user.isActive) { setDisableUser(user); return; }
    runToggle(user).catch((e: any) => setError(e?.response?.data?.message ?? 'Failed'));
  }

  const filtered = users.filter(u =>
    !search ||
    u.fullName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#06040f', color: 'var(--text-primary, #e2dfd8)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}><button onClick={() => window.history.back()} style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "6px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "IBM Plex Sans,sans-serif" }}>Back</button><div style={{ fontSize: 20, fontWeight: 700 }}>Users</div></div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Manage user accounts and role assignments</div>
        </div>
        <button onClick={() => setEditUser('new')} style={BTN('primary')}>+ New User</button>
      </div>

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Search */}
        <input style={{ ...INP, maxWidth: 340 }} placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Total Users', value: users.length, color: 'var(--text-primary, #e2dfd8)' },
            { label: 'Active', value: users.filter(u => u.isActive).length, color: 'var(--success, #4ade80)' },
            { label: 'Inactive', value: users.filter(u => !u.isActive).length, color: 'var(--danger, #f87171)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 16px', minWidth: 110 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "'IBM Plex Mono',monospace" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)' }}>Loading...</div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 2fr 1fr', gap: 0, padding: '10px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.07)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
              <div>User</div><div>Email</div><div>Status</div><div>Roles</div><div style={{ textAlign: 'right' }}>Actions</div>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>No users found</div>
            ) : filtered.map((user, i) => (
              <div key={user.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 2fr 1fr', gap: 0, padding: '12px 16px', borderBottom: i < filtered.length - 1 ? '0.5px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
                {/* Name */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: user.isActive ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.35)' }}>{user.fullName}</div>
                  {user.lastLoginAt && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>Last login: {new Date(user.lastLoginAt).toLocaleDateString()}</div>}
                </div>
                {/* Email */}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'IBM Plex Mono',monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                {/* Status */}
                <div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 600, background: user.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: user.isActive ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)', border: `0.5px solid ${user.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {/* Roles */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {user.roles.length === 0
                    ? <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>No roles</span>
                    : user.roles.map(r => (
                        <span key={r.id} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(251,146,60,0.1)', color: 'var(--accent-strong, #fb923c)', border: '0.5px solid rgba(251,146,60,0.2)' }}>{r.name}</span>
                      ))
                  }
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditUser(user)} style={{ ...BTN('ghost'), padding: '5px 10px', fontSize: 11 }}>Edit</button>
                  <button onClick={() => setResetUser(user)} style={{ ...BTN('ghost'), padding: '5px 10px', fontSize: 11 }}>Pwd</button>
                  <button onClick={() => toggleActive(user)} style={{ ...BTN(user.isActive ? 'danger' : 'ghost'), padding: '5px 10px', fontSize: 11 }}>
                    {user.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {editUser !== null && (
        <UserModal
          user={editUser === 'new' ? null : editUser}
          roles={roles}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load(); }}
        />
      )}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={() => { setResetUser(null); load(); }}
        />
      )}

      <ConfirmModal
        open={disableUser !== null}
        onClose={() => setDisableUser(null)}
        title={disableUser ? `Disable ${disableUser.fullName}?` : ''}
        description="The user will be unable to sign in until re-enabled."
        variant="destructive"
        confirmLabel="Disable User"
        onConfirm={async () => { if (disableUser) await runToggle(disableUser); }}
      />
    </div>
  );
}
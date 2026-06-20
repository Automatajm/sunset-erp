"use client";

import { useState, useEffect, useCallback } from 'react';
import apiClient from '@/lib/api/client';
import { FormModal } from '@/components/ui/modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantUser {
  id: string;
  fullName: string;
  email: string;
  roles: { code: string; name: string }[];
}

interface Category {
  id: string;
  code: string;
  name: string;
  macroCategory: { id: string; name: string };
}

interface MacroCategory {
  id: string;
  code: string;
  name: string;
}

interface Assignment {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
  assignedLineIds: string[];
  assignedCount: number;
  zoneIds: string[];
  categoryIds: string[];
  macroCategoryIds: string[];
  itemIds: string[];
  notes: string | null;
  createdAt: string;
}

interface AssignmentModalProps {
  sessionId:   string;
  warehouseId: string;
  onClose:     () => void;
  onSaved:     () => void;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INP: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 7, padding: '8px 12px', fontSize: 13,
  fontFamily: "'IBM Plex Sans',sans-serif",
  color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: '100%',
  boxSizing: 'border-box' as const,
};

const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' };

const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)',
  marginBottom: 5, display: 'block',
};

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function Tag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', borderRadius: 20, padding: '2px 8px 2px 10px', fontSize: 11, color: 'var(--accent-blue, #60a5fa)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: 'var(--accent-blue, #60a5fa)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
    </span>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
// spec-frontend-002 — refactored onto the shared FormModal (was a 393-line
// one-off overlay/panel/footer composition). FormModal now owns the shell,
// submit/validation state, and the cancel/submit footer.

export default function AssignmentModal({ sessionId, onClose, onSaved }: AssignmentModalProps) {
  // Data
  const [users,           setUsers]           = useState<TenantUser[]>([]);
  const [categories,      setCategories]      = useState<Category[]>([]);
  const [macroCategories, setMacroCategories] = useState<MacroCategory[]>([]);
  const [assignments,     setAssignments]     = useState<Assignment[]>([]);

  // Form state
  const [selectedUserId,      setSelectedUserId]      = useState('');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedMacroCatIds, setSelectedMacroCatIds] = useState<string[]>([]);
  const [notes,               setNotes]               = useState('');

  // UI state
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [preview,  setPreview]  = useState<{ totalLines: number; unassignedLines: number } | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, catsRes, macroCatsRes, assignRes] = await Promise.all([
        apiClient.get('/auth/users'),
        apiClient.get('/categories'),
        apiClient.get('/macro-categories'),
        apiClient.get(`/stock-reconciliation/${sessionId}/assignments`),
      ]);
      setUsers(usersRes.data.users ?? []);
      setCategories(catsRes.data.categories ?? []);          // envelope (spec-009)
      setMacroCategories(macroCatsRes.data.macroCategories ?? []); // envelope (spec-006)
      setAssignments(assignRes.data ?? []);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── DTO + actions ────────────────────────────────────────────────────────────

  const buildDto = () => ({
    userId:           selectedUserId,
    categoryIds:      selectedCategoryIds.length ? selectedCategoryIds : undefined,
    macroCategoryIds: selectedMacroCatIds.length ? selectedMacroCatIds : undefined,
    notes:            notes || undefined,
  });

  async function handlePreview() {
    if (!selectedUserId) return;
    try {
      const res = await apiClient.post(
        `/stock-reconciliation/${sessionId}/assignments/preview`,
        buildDto(),
      );
      setPreview(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Preview failed');
    }
  }

  // FormModal awaits this; throwing keeps the modal open and surfaces the error.
  async function handleSave() {
    if (!selectedUserId) { setError('Select a user first'); return; }
    setSaving(true); setError(null);
    try {
      await apiClient.post(`/stock-reconciliation/${sessionId}/assignments`, buildDto());
      setSelectedUserId('');
      setSelectedCategoryIds([]);
      setSelectedMacroCatIds([]);
      setNotes('');
      setPreview(null);
      await loadData();
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(assignmentId: string) {
    setDeleting(assignmentId); setError(null);
    try {
      await apiClient.delete(`/stock-reconciliation/${sessionId}/assignments/${assignmentId}`);
      await loadData();
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  function toggleCategory(id: string) {
    setSelectedCategoryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setPreview(null);
  }
  function toggleMacroCat(id: string) {
    setSelectedMacroCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setPreview(null);
  }

  const selectedUser = users.find(u => u.id === selectedUserId);
  const hasFilters   = selectedCategoryIds.length > 0 || selectedMacroCatIds.length > 0;

  return (
    <FormModal
      open
      onClose={onClose}
      title="Assign Count Lines"
      description="Assign lines to auxiliaries by category or macrocategory"
      submitLabel="Assign Lines"
      submitting={saving}
      isValid={!!selectedUserId}
      error={error}
      width={700}
      onSubmit={handleSave}
    >
      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: 40, fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {/* Existing assignments */}
          {assignments.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={LABEL}>Current Assignments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {assignments.map(a => (
                  <div key={a.id} style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary, #e2dfd8)' }}>
                        {a.user ? `${a.user.firstName} ${a.user.lastName}` : a.userId}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                        {a.assignedCount} lines assigned
                        {a.categoryIds?.length > 0 && ` · ${a.categoryIds.length} category filter(s)`}
                        {a.macroCategoryIds?.length > 0 && ` · ${a.macroCategoryIds.length} macrocategory filter(s)`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(a.id)}
                      disabled={deleting === a.id}
                      style={{ background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'var(--danger, #f87171)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                      {deleting === a.id ? '…' : 'Remove'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New assignment form */}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
            New Assignment
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Assign to User *</label>
            <select style={SEL} value={selectedUserId}
              onChange={e => { setSelectedUserId(e.target.value); setPreview(null); }}>
              <option value="">Select a user…</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.fullName} {u.roles.length > 0 ? `(${u.roles.map(r => r.name).join(', ')})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Filter by Macrocategory (optional)</label>
            <select style={SEL} value=""
              onChange={e => { if (e.target.value) toggleMacroCat(e.target.value); }}>
              <option value="">Add macrocategory…</option>
              {macroCategories.filter(m => !selectedMacroCatIds.includes(m.id))
                .map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {selectedMacroCatIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {selectedMacroCatIds.map(id => {
                  const m = macroCategories.find(x => x.id === id);
                  return m ? <Tag key={id} label={m.name} onRemove={() => toggleMacroCat(id)} /> : null;
                })}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>Filter by Category (optional)</label>
            <select style={SEL} value=""
              onChange={e => { if (e.target.value) toggleCategory(e.target.value); }}>
              <option value="">Add category…</option>
              {categories.filter(c => !selectedCategoryIds.includes(c.id))
                .map(c => <option key={c.id} value={c.id}>{c.macroCategory?.name} › {c.name}</option>)}
            </select>
            {selectedCategoryIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {selectedCategoryIds.map(id => {
                  const c = categories.find(x => x.id === id);
                  return c ? <Tag key={id} label={c.name} onRemove={() => toggleCategory(id)} /> : null;
                })}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Notes (optional)</label>
            <input style={INP} type="text" placeholder="e.g. Zona A — Pasillo 01"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {!hasFilters && selectedUserId && (
            <div style={{ background: 'rgba(251,191,36,0.08)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--warning, #fbbf24)', marginBottom: 12 }}>
              No filters selected — all unassigned lines will be assigned to this user.
            </div>
          )}

          {preview && (
            <div style={{ background: 'rgba(74,222,128,0.06)', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--success, #4ade80)', marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>{preview.unassignedLines}</span> unassigned lines available out of {preview.totalLines} total.
              {selectedUserId && <span> Ready to assign to <b>{selectedUser?.fullName}</b>.</span>}
            </div>
          )}

          {/* Preview is a secondary, body-level action; the footer owns Assign/Cancel. */}
          <button
            onClick={handlePreview}
            disabled={!selectedUserId}
            style={{ width: '100%', height: 38, borderRadius: 7, fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, background: selectedUserId ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)', border: `0.5px solid ${selectedUserId ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`, color: selectedUserId ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.2)', cursor: selectedUserId ? 'pointer' : 'not-allowed' }}>
            Preview
          </button>
        </>
      )}
    </FormModal>
  );
}

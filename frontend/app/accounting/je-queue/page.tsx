"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { automationApi } from '@/lib/api/automation';

interface JeQueueItem {
  id: string; eventType: string; sourceType: string; sourceRef?: string;
  status: string; createdAt: string; reviewedAt?: string; rejectReason?: string; notes?: string;
  journalEntry: {
    id: string; entryNumber: string; entryDate: string; description: string;
    status: string; journalType: string;
    lines: { id: string; lineNumber: number; description: string; debitAmount: number; creditAmount: number; account: { accountNumber: string; name: string } }[];
  };
}

interface QueueStats { pending: number; approved: number; rejected: number; total: number }

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };

const EVENT_COLORS: Record<string, string> = {
  ar_invoice: '#60a5fa', ar_payment: '#60a5fa', ar_reversal: '#f87171',
  fg_delivery: '#4ade80', production_variance: '#fbbf24',
  po_receipt: '#a78bfa', mo_issue: '#a78bfa',
};

function fmtAmt(v: number) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(v); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }

function RejectModal({ item, onClose, onRejected }: { item: JeQueueItem; onClose: () => void; onRejected: () => void }) {
  const [reason, setReason] = useState('');
  const [notes,  setNotes]  = useState('');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setError('Rejection reason required'); return; }
    setBusy(true);
    try {
      await automationApi.rejectQueueItem(item.id, reason, notes || undefined);
      onRejected(); onClose();
    } catch { setError('Failed to reject'); }
    finally { setBusy(false); }
  };

  const INPUT_S: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(248,113,113,0.2)', borderRadius:14, width:'100%', maxWidth:440, boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ padding:'14px 18px 10px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:13, fontWeight:500, color:'#f1ede8' }}>Reject — {item.journalEntry.entryNumber}</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'7px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(248,113,113,0.6)' }}>Rejection Reason *</label>
              <input placeholder="e.g. Wrong account used — needs correction" style={INPUT_S} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.3)' }}>Notes (optional)</label>
              <input placeholder="Additional notes" style={INPUT_S} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'10px 18px 16px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'7px 14px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background:'linear-gradient(135deg,#7f1d1d,#dc2626)', border:'none', borderRadius:7, padding:'7px 18px', fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', opacity:busy?0.5:1 }}>
              {busy ? 'Rejecting…' : 'Reject & Delete JE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function JeQueuePage() {
  const [items,       setItems]       = useState<JeQueueItem[]>([]);
  const [stats,       setStats]       = useState<QueueStats | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [approving,   setApproving]   = useState<string | null>(null);
  const [rejectItem,  setRejectItem]  = useState<JeQueueItem | null>(null);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [queueData, statsData] = await Promise.all([
        automationApi.getQueue({ status: statusFilter || undefined }),
        automationApi.getQueueStats(),
      ]);
      setItems(Array.isArray(queueData) ? queueData : []);
      setStats(statsData);
    } catch { setError('Failed to load queue'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApprove = async (item: JeQueueItem) => {
    setApproving(item.id); setError(''); setSuccess('');
    try {
      await automationApi.approveQueueItem(item.id);
      setSuccess(`✓ JE ${item.journalEntry.entryNumber} approved and posted`);
      setTimeout(() => setSuccess(''), 4000);
      fetchData();
    } catch (err) {
      setError((err as any).response?.data?.message || 'Approval failed');
    } finally { setApproving(null); }
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'JE Review Queue']} title="JE Review Queue">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .queue-page { padding: 0 18px 24px; }
        .queue-stats { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .queue-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:7px 14px; display:flex; flex-direction:column; gap:2px; min-width:90px; cursor:pointer; transition:opacity 0.15s; }
        .queue-stat:hover { opacity:0.8; }
        .queue-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .queue-table { width:100%; border-collapse:collapse; }
        .queue-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .queue-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .queue-table tbody tr:last-child td { border-bottom:none; }
        .queue-table tbody tr:hover td { background:rgba(251,146,60,0.02); }
        .queue-empty { text-align:center; padding:52px; color:rgba(255,255,255,0.25); font-size:13px; }
        .queue-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
      `}</style>

      <div className="queue-page">
        {/* Stats */}
        {stats && (
          <div className="queue-stats">
            {[
              { label: 'Pending',  value: stats.pending,  color: '#fbbf24', filter: 'pending' },
              { label: 'Approved', value: stats.approved, color: '#4ade80', filter: 'approved' },
              { label: 'Rejected', value: stats.rejected, color: '#f87171', filter: 'rejected' },
              { label: 'Total',    value: stats.total,    color: '#fb923c', filter: '' },
            ].map(s => (
              <div key={s.label} className="queue-stat"
                style={{ border:`0.5px solid ${statusFilter === s.filter ? `${s.color}40` : 'rgba(255,255,255,0.07)'}` }}
                onClick={() => setStatusFilter(prev => prev === s.filter ? '' : s.filter)}>
                <span style={{ fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:s.color }}>{s.label}</span>
                <span style={{ fontSize:20, fontWeight:500, fontFamily:"'IBM Plex Mono',monospace", color:'#f1ede8' }}>{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center' }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.09)', borderRadius:7, padding:'7px 12px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none' }}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)' }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>

        {error   && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#fca5a5' }}>{error}</div>}
        {success && <div style={{ background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#4ade80' }}>{success}</div>}

        <div className="queue-wrap">
          {loading ? <div className="queue-empty">Loading…</div>
            : items.length === 0 ? <div className="queue-empty">{statusFilter === 'pending' ? '✓ No pending JEs — queue is clear' : 'No items found'}</div>
            : (
              <>
                <table className="queue-table">
                  <thead>
                    <tr>{['', 'JE Number', 'Event', 'Source Ref', 'Description', 'Total DR', 'Date', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const totalDr   = item.journalEntry.lines.reduce((s, l) => s + l.debitAmount, 0);
                      const evtColor  = EVENT_COLORS[item.eventType] ?? '#e2dfd8';
                      const isExp     = expanded === item.id;
                      const isBusy    = approving === item.id;

                      return (
                        <>
                          <tr key={item.id} style={{ cursor:'pointer' }} onClick={() => setExpanded(isExp ? null : item.id)}>
                            <td style={{ width:24 }}>
                              <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', transform:isExp?'rotate(90deg)':'none', display:'inline-block', transition:'transform 0.15s' }}>▶</span>
                            </td>
                            <td><span style={{ ...MONO, color:'#fb923c', fontWeight:500 }}>{item.journalEntry.entryNumber}</span></td>
                            <td>
                              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, color:evtColor, background:`${evtColor}15`, border:`0.5px solid ${evtColor}30` }}>
                                {item.eventType.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td><span style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.5)' }}>{item.sourceRef ?? '—'}</span></td>
                            <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.55)' }}>{item.journalEntry.description}</span></td>
                            <td><span style={{ ...MONO, color:'#e2dfd8' }}>{fmtAmt(totalDr)}</span></td>
                            <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{fmtDate(item.createdAt)}</span></td>
                            <td>
                              <span style={{
                                fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:500,
                                color:      item.status==='pending' ? '#fbbf24' : item.status==='approved' ? '#4ade80' : '#f87171',
                                background: item.status==='pending' ? 'rgba(251,191,36,0.1)' : item.status==='approved' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                                border:     `0.5px solid ${item.status==='pending' ? 'rgba(251,191,36,0.2)' : item.status==='approved' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
                              }}>{item.status}</span>
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              {item.status === 'pending' && (
                                <div style={{ display:'flex', gap:4 }}>
                                  <button onClick={() => handleApprove(item)} disabled={isBusy}
                                    style={{ padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer', color:'#4ade80', background:'rgba(74,222,128,0.1)', border:'0.5px solid rgba(74,222,128,0.2)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:isBusy?0.5:1 }}>
                                    {isBusy ? '…' : '✓ Approve'}
                                  </button>
                                  <button onClick={() => setRejectItem(item)} disabled={isBusy}
                                    style={{ padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer', color:'#f87171', background:'rgba(248,113,113,0.08)', border:'0.5px solid rgba(248,113,113,0.15)', fontFamily:"'IBM Plex Sans',sans-serif" }}>
                                    ✕ Reject
                                  </button>
                                </div>
                              )}
                              {item.status === 'rejected' && item.rejectReason && (
                                <span style={{ fontSize:11, color:'rgba(248,113,113,0.6)', fontStyle:'italic' }}>{item.rejectReason}</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded JE lines */}
                          {isExp && (
                            <tr key={`${item.id}-exp`}>
                              <td colSpan={9} style={{ padding:0 }}>
                                <div style={{ padding:'8px 40px 14px', background:'rgba(251,146,60,0.015)', borderTop:'0.5px solid rgba(255,255,255,0.04)' }}>
                                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                                    <thead>
                                      <tr>{['#', 'Account', 'Description', 'Debit', 'Credit'].map(h => (
                                        <th key={h} style={{ padding:'4px 10px', fontSize:10, color:'rgba(251,146,60,0.5)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                                      ))}</tr>
                                    </thead>
                                    <tbody>
                                      {item.journalEntry.lines.map(line => (
                                        <tr key={line.id}>
                                          <td style={{ padding:'5px 10px', ...MONO, color:'rgba(255,255,255,0.3)', width:30 }}>{line.lineNumber}</td>
                                          <td style={{ padding:'5px 10px' }}>
                                            <span style={{ ...MONO, color:'#fb923c', fontSize:11 }}>{line.account.accountNumber}</span>
                                            <span style={{ fontSize:12, color:'rgba(255,255,255,0.55)', marginLeft:8 }}>{line.account.name}</span>
                                          </td>
                                          <td style={{ padding:'5px 10px', fontSize:12, color:'rgba(255,255,255,0.4)' }}>{line.description}</td>
                                          <td style={{ padding:'5px 10px', ...MONO, color: line.debitAmount > 0 ? '#e2dfd8' : 'rgba(255,255,255,0.2)', textAlign:'right' }}>
                                            {line.debitAmount > 0 ? fmtAmt(line.debitAmount) : '—'}
                                          </td>
                                          <td style={{ padding:'5px 10px', ...MONO, color: line.creditAmount > 0 ? '#a78bfa' : 'rgba(255,255,255,0.2)', textAlign:'right' }}>
                                            {line.creditAmount > 0 ? fmtAmt(line.creditAmount) : '—'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr>
                                        <td colSpan={3} style={{ padding:'6px 10px', fontSize:10, color:'rgba(255,255,255,0.25)', textAlign:'right', borderTop:'0.5px solid rgba(255,255,255,0.06)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Totals</td>
                                        <td style={{ padding:'6px 10px', ...MONO, color:'#e2dfd8', fontWeight:500, textAlign:'right', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
                                          {fmtAmt(item.journalEntry.lines.reduce((s, l) => s + l.debitAmount, 0))}
                                        </td>
                                        <td style={{ padding:'6px 10px', ...MONO, color:'#a78bfa', fontWeight:500, textAlign:'right', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
                                          {fmtAmt(item.journalEntry.lines.reduce((s, l) => s + l.creditAmount, 0))}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
                <div className="queue-footer">{items.length} item{items.length !== 1 ? 's' : ''}</div>
              </>
            )}
        </div>
      </div>

      {rejectItem && <RejectModal item={rejectItem} onClose={() => setRejectItem(null)} onRejected={fetchData} />}
    </ERPShell>
  );
}
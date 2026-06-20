'use client';

// ============================================================================
// FILE: frontend/components/print/DocumentLayout.tsx
// spec-frontend-005 — shared print frame. The 6 documents are thin compositions
// of <DocumentLayout> + <LinesTable>. HTML + print CSS only (no deps): the app
// is dark-only, but the print view is the one sanctioned light-on-white exception
// (DESIGN-SYSTEM). On screen it renders as a centred "paper" with a toolbar that
// is hidden in print via @media print.
// ============================================================================
import React from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';

export interface PartyBlock {
  label: string;
  name: string;
  lines?: (string | null | undefined)[];
}
export interface MetaField {
  label: string;
  value: React.ReactNode;
}

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

// ── On-screen toolbar (hidden in print) ───────────────────────────────────────
function PrintToolbar() {
  return (
    <div
      className="no-print"
      style={{
        position: 'sticky', top: 0, zIndex: 10, display: 'flex', gap: 10, justifyContent: 'center',
        padding: '12px', background: 'rgba(10,7,18,0.9)', borderBottom: '0.5px solid rgba(255,255,255,0.1)',
      }}
    >
      <button
        onClick={() => window.print()}
        style={{
          border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'IBM Plex Sans',sans-serif", color: 'white',
          background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print / Save as PDF
      </button>
      <button
        onClick={() => window.close()}
        style={{
          border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.06)',
        }}
      >
        Close
      </button>
    </div>
  );
}

// ── The document frame ─────────────────────────────────────────────────────────
export function DocumentLayout({
  title, number, date, status, party, meta, footerNote, terms, currency, signatures, children,
}: {
  title: string;
  number: string;
  date: string | null | undefined;
  status?: string;
  party: PartyBlock;
  meta?: MetaField[];
  footerNote?: string | null;
  terms?: string | null;
  currency?: string;
  signatures?: string[];   // spec-frontend-006 — per-document signature blocks
  children: React.ReactNode;
}) {
  const { tenantName } = useAuth();
  return (
    <>
      {/* Print stylesheet — the sanctioned light-on-white exception */}
      <style>{`
        @media screen { .print-paper { box-shadow: 0 8px 40px rgba(0,0,0,0.5); margin: 24px auto; } }
        @media print {
          .no-print { display: none !important; }
          html, body { background: var(--white, #ffffff) !important; margin: 0; }
          .print-paper { box-shadow: none; margin: 0; width: 100%; }
          thead { display: table-header-group; }  /* repeat column header per page */
          tr { page-break-inside: avoid; }
        }
        @page { size: A4; margin: 16mm 14mm; }
      `}</style>

      <PrintToolbar />

      <div
        className="print-paper"
        style={{
          width: '210mm', maxWidth: '100%', minHeight: '297mm', boxSizing: 'border-box',
          background: 'var(--white, #ffffff)', color: '#1a1a1a', padding: '18mm 16mm',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontSize: 12, lineHeight: 1.45,
        }}
      >
        {/* ── Header ── */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1a1a1a', paddingBottom: 14, marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{tenantName || 'Company'}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{title}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-pressed, #c2410c)', letterSpacing: '0.02em' }}>{number}</div>
            <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>Date: {fmtDate(date)}</div>
            {status && (
              <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-pressed, #c2410c)', border: '1px solid var(--accent-pressed, #c2410c)' }}>
                {status}
              </div>
            )}
          </div>
        </header>

        {/* ── Party + meta ── */}
        <section style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#999', marginBottom: 4 }}>{party.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{party.name}</div>
            {(party.lines ?? []).filter(Boolean).map((l, i) => (
              <div key={i} style={{ fontSize: 11, color: '#555' }}>{l}</div>
            ))}
          </div>
          {meta && meta.length > 0 && (
            <div style={{ flex: 1, maxWidth: '45%' }}>
              <table style={{ width: '100%', fontSize: 11 }}>
                <tbody>
                  {meta.map((m, i) => (
                    <tr key={i}>
                      <td style={{ color: '#888', padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>{m.label}</td>
                      <td style={{ color: '#222', fontWeight: 500, textAlign: 'right' }}>{m.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Body ── */}
        <main>{children}</main>

        {/* ── Footer ── */}
        <footer style={{ marginTop: 28 }}>
          {(footerNote || terms) && (
            <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginBottom: 24, fontSize: 11, color: '#555' }}>
              {terms && <div><strong style={{ color: '#333' }}>Terms:</strong> {terms}</div>}
              {footerNote && <div style={{ marginTop: 4 }}><strong style={{ color: '#333' }}>Notes:</strong> {footerNote}</div>}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 40, marginTop: 36 }}>
            {(signatures ?? ['Prepared by', 'Received by']).map((s) => (
              <div key={s} style={{ flex: 1 }}>
                <div style={{ borderTop: '1px solid #333', paddingTop: 6, fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 9, color: '#aaa' }}>
            {tenantName} · Generated {fmtDate(new Date().toISOString())}{currency ? ` · Currency: ${currency}` : ''}
          </div>
        </footer>
      </div>
    </>
  );
}

// ── Shared line-items table + totals ───────────────────────────────────────────
export interface DocLine {
  code?: string | null;
  description?: string | null;
  quantity: number | string;
  uom?: string | null;
  unitPrice?: number | string | null;
  lineTotal?: number | string | null;
}

const num = (v: unknown) => Number(v ?? 0);
const money = (v: unknown, ccy?: string) =>
  `${ccy ? ccy + ' ' : ''}${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function LinesTable({
  lines, currency, totals,
}: {
  lines: DocLine[];
  currency?: string;
  totals?: { subtotal?: number | string; tax?: number | string; total?: number | string };
}) {
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', borderBottom: '1.5px solid #333', padding: '7px 8px' };
  const td: React.CSSProperties = { fontSize: 11, color: '#222', borderBottom: '0.5px solid #eee', padding: '7px 8px', verticalAlign: 'top' };
  const r: React.CSSProperties = { ...th, textAlign: 'right' };
  const rd: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...th, width: 32 }}>#</th>
          <th style={th}>Item</th>
          <th style={r}>Qty</th>
          <th style={{ ...th, width: 60 }}>UOM</th>
          <th style={r}>Unit Price</th>
          <th style={r}>Line Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td style={td}>{i + 1}</td>
            <td style={td}>
              {l.code && <span style={{ fontWeight: 600, color: '#111' }}>{l.code}</span>}
              {l.code && (l.description) ? ' — ' : ''}
              {l.description ?? (l.code ? '' : '—')}
            </td>
            <td style={rd}>{num(l.quantity).toLocaleString('en-US')}</td>
            <td style={td}>{l.uom ?? '—'}</td>
            <td style={rd}>{l.unitPrice != null ? money(l.unitPrice) : '—'}</td>
            <td style={rd}>{l.lineTotal != null ? money(l.lineTotal) : '—'}</td>
          </tr>
        ))}
        {lines.length === 0 && (
          <tr><td style={{ ...td, textAlign: 'center', color: '#999' }} colSpan={6}>No line items</td></tr>
        )}
      </tbody>
      {totals && (
        <tfoot>
          {totals.subtotal != null && (
            <tr><td colSpan={4} /><td style={{ ...rd, color: '#888', borderBottom: 'none' }}>Subtotal</td><td style={{ ...rd, borderBottom: 'none' }}>{money(totals.subtotal, currency)}</td></tr>
          )}
          {totals.tax != null && num(totals.tax) > 0 && (
            <tr><td colSpan={4} /><td style={{ ...rd, color: '#888', borderBottom: 'none' }}>Tax</td><td style={{ ...rd, borderBottom: 'none' }}>{money(totals.tax, currency)}</td></tr>
          )}
          {totals.total != null && (
            <tr><td colSpan={4} /><td style={{ ...rd, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333' }}>Total</td><td style={{ ...rd, fontWeight: 700, color: 'var(--accent-pressed, #c2410c)', borderTop: '1.5px solid #333' }}>{money(totals.total, currency)}</td></tr>
          )}
        </tfoot>
      )}
    </table>
  );
}

'use client';

// ============================================================================
// FILE: frontend/app/print/[doc]/[id]/page.tsx
// spec-frontend-005 — standalone print-ready route. Renders one of the 6
// documents (PRINT_DOCS registry) light-on-white, outside ERPShell. Reached via
// the per-page Print button (window.open). Stock report: /print/stock-movements/
// report?warehouseId=&from=&to=
// ============================================================================
import { Suspense, use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PRINT_DOCS } from '@/components/print/documents';

export default function PrintDocumentPage({
  params,
}: {
  params: Promise<{ doc: string; id: string }>;
}) {
  // useSearchParams requires a Suspense boundary (Next prerender contract).
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--w50, rgba(255,255,255,0.5))' }}>Loading…</div>}>
      <PrintDocumentInner params={params} />
    </Suspense>
  );
}

function PrintDocumentInner({
  params,
}: {
  params: Promise<{ doc: string; id: string }>;
}) {
  const { doc, id } = use(params);
  const query = useSearchParams();
  const spec = PRINT_DOCS[doc];

  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!spec) return; // unknown doc handled in render (no setState in effect)
    let alive = true;
    (async () => {
      try {
        const qp = new URLSearchParams(query?.toString() ?? '');
        const d = await spec.fetch(id, qp);
        if (alive) { setData(d); setLoading(false); }
      } catch (e) {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        if (alive) { setError(msg ?? 'Failed to load document'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [spec, id, query]);

  if (!spec) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Unknown document type &quot;{doc}&quot;</div>;
  }
  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--w50, rgba(255,255,255,0.5))', fontFamily: "'IBM Plex Sans',sans-serif" }}>Loading document…</div>;
  }
  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif" }}>{error}</div>;
  }
  const qp = new URLSearchParams(query?.toString() ?? '');
  return <>{spec.render(data, qp)}</>;
}

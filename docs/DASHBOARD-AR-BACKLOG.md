# Dashboard AR Backlog — Pendientes Post-Sprint 5

> **Status:** Pendiente  
> **Aplica a:** `frontend/app/page.tsx` (Dashboard principal)  
> **Prerequisito:** Sprint 5 AR Invoicing completado ✅  
> **API disponible:** `GET /api/ar-invoices/kpis` y `GET /api/ar-invoices/aging`

---

## 1. KPI Table — agregar fila AR

La tabla KPI del dashboard (`KPI Table` en `page.tsx`) actualmente muestra:
- Revenue, Net Income, EBIT, EBITDA, Gross Margin %

**Agregar estas filas:**

| Metric | Source | Format |
|--------|--------|--------|
| AR Invoiced | `arKpis.invoiced` | Currency |
| AR Collected | `arKpis.collected` | Currency |
| AR Overdue | `arKpis.overdue` | Currency — rojo si > 0 |
| Collection Rate | `arKpis.collectionRate` | % — verde si ≥ 80%, amarillo si < 80% |

**Cómo:** Llamar `GET /api/ar-invoices/kpis` en el `useEffect` del dashboard junto a las otras llamadas. Agregar las filas al array `kpiRows`.

---

## 2. Financials Table — agregar sección AR

La tabla Financials (`Financials Table`) actualmente muestra Revenue, Expenses, Gross Profit, etc.

**Agregar bloque AR debajo de Revenue:**

| Row | Value | Budget | Variance |
|-----|-------|--------|----------|
| AR Outstanding | `arKpis.pending` | — | — |
| AR Overdue | `arKpis.overdue` | — | color rojo |
| Collection Rate | `arKpis.collectionRate %` | — | color por umbral |

---

## 3. Aging Widget — nuevo widget en dashboard

Agregar un widget compacto de AR Aging debajo de las tablas principales.

**Diseño:** 4 columnas horizontales con montos y counts.

```
┌─────────────────────────────────────────────────────┐
│  AR AGING                                    [→ Ver] │
│  Current      1-30d       31-60d      90d+          │
│  $0           $0          $3,850      $5,500        │
│  0 invoices   0 invoices  1 invoice   1 invoice     │
└─────────────────────────────────────────────────────┘
```

**Cómo:** Llamar `GET /api/ar-invoices/aging` y renderizar los 4 buckets. El botón `→ Ver` navega a `/sales/invoices?status=overdue`.

---

## 4. Cambios de código necesarios

### `frontend/app/page.tsx`

**Paso 1 — Import:**
```typescript
import { arInvoicesApi, ArKpis, ArAging } from '@/lib/api/ar-invoices';
```

**Paso 2 — State:**
```typescript
const [arKpis, setArKpis] = useState<ArKpis | null>(null);
const [arAging, setArAging] = useState<ArAging | null>(null);
```

**Paso 3 — Fetch (agregar al Promise.all existente):**
```typescript
const [/* existing */, arK, arA] = await Promise.all([
  // ...existing calls...
  arInvoicesApi.getKpis(),
  arInvoicesApi.getAging(),
]);
setArKpis(arK);
setArAging(arA);
```

**Paso 4 — KPI rows (agregar al array kpiRows):**
```typescript
{ label: 'AR Invoiced',      current: arKpis?.invoiced ?? 0,        fmt: 'currency' },
{ label: 'AR Collected',     current: arKpis?.collected ?? 0,       fmt: 'currency' },
{ label: 'AR Overdue',       current: arKpis?.overdue ?? 0,         fmt: 'currency', alertIfPositive: true },
{ label: 'Collection Rate',  current: arKpis?.collectionRate ?? 0,  fmt: 'percent',  threshold: 80 },
```

**Paso 5 — Aging widget (agregar debajo de las tablas):**
```tsx
{arAging && (
  <AgingWidget aging={arAging} />
)}
```

---

## 5. Componente AgingWidget

Crear en `frontend/components/dashboard/AgingWidget.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { ArAging } from '@/lib/api/ar-invoices';

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

export default function AgingWidget({ aging }: { aging: ArAging }) {
  const router = useRouter();
  const buckets = [
    { label: 'Current',  data: aging.summary.current,    color: '#4ade80' },
    { label: '1–30d',    data: aging.summary.days1to30,  color: '#fbbf24' },
    { label: '31–60d',   data: aging.summary.days31to60, color: '#fb923c' },
    { label: '90d+',     data: aging.summary.days90plus, color: '#f87171' },
  ];

  return (
    <div style={{ background: 'rgba(10,7,18,0.7)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 16px', marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>AR Aging</span>
        <button onClick={() => router.push('/sales/invoices')}
          style={{ fontSize: 11, color: 'rgba(96,165,250,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          View all →
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {buckets.map(b => (
          <div key={b.label}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: b.color, opacity: 0.7, marginBottom: 4 }}>{b.label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color: b.color, fontWeight: 500 }}>{fmtAmt(b.data.amount)}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{b.data.count} invoice{b.data.count !== 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Notas adicionales

- El dashboard ya tiene `PLData2` type extendido — agregar `arKpis` y `arAging` al tipo si se usa TypeScript estricto
- Los KPI de AR son **independientes del período seleccionado** en el dashboard (siempre muestran estado actual) — aclarar esto con un label `"As of today"` junto al widget
- Si el tenant no tiene invoices, los valores serán 0 — no mostrar error, solo dash `—`
- Sprint 9 (Bulk Import) incluirá import masivo de AR invoices desde Excel — no implementar aquí

---

*Backlog creado: 2026-03-22 — Sprint 5 complete, aplicar en sprint dedicado a dashboard polish*

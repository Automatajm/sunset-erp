# spec-frontend-002 — Data Components (Filter Panel, DataTable, TreeTable, Modal System)

Status: **Complete**  
Owner: Frontend / Design System  
Sprint: TBD  
Module(s): `frontend` — `components/ui/` primitives + ~21 consumer pages  
Last updated: 2026-06-07  

> Independent of [`spec-frontend-001-theming`](./spec-frontend-001-theming.md). That spec
> tokenizes colors; this one reworks data-display behavior. They touch the same files but do
> not depend on each other — this spec can ship first. New code here SHOULD be written so a
> later token swap is mechanical (group colors in local style maps), but MUST NOT block on the
> theming refactor. Acceptance criteria are written from a live audit (2026-06-04); `- [ ]`
> items are gaps to close.

---

## Purpose

- **Who uses this module?** Frontend developers building and maintaining every data-heavy page, and through them every ERP end user across ~21+ pages — anyone filtering, paging, exporting, or acting on a table, confirming a destructive action, or filling a form dialog.
- **What business problem does it solve?** It hardens the shared table, filter, and modal primitives — debounced search, a non-shifting footer, a collapsible filter panel, and a consistent `ConfirmModal`/`FormModal`/`DetailModal` system with absorbed (not relayed) error states — so every page composes the same well-behaved building blocks instead of reinventing them.
- **What can the business NOT do without this module?** It cannot guarantee consistent, safe data interaction across pages — destructive actions stay unguarded (native `window.confirm` or none), each page hand-wires its own divergent dialogs and error handling, and operators face shifting footers, laggy search, and raw backend errors.

## Business value

Inconsistent and incomplete data components are an adoption and reliability risk on the surfaces operators use all day. Unguarded destructive actions (the audit found 17) mean a stray click can void an invoice or delete a BOM with no confirmation; raw backend errors and shifting table footers make the system feel unprofessional and slow people down. Every page reinventing modals and filters multiplies bugs and maintenance cost. A single set of hardened primitives — guarded confirmations, debounced search, stable pagination, and absorbed error states — makes the whole frontend safer, faster to use, and far cheaper to extend.

---

## Problem

The frontend already has three home-grown data primitives — `ERPTable`, `ERPTreeTable`,
`ERPFilterBar` — used across ~21 pages (all of `inventory/`, `procurement/`, plus
`manufacturing/production-plans` and `settings/bulk-import`). They are good but **incomplete and
inconsistent**, and there is **no reusable modal layer** at all — only raw Radix primitives,
which every page re-composes by hand (e.g. `AssignmentModal.tsx`, a 391-line one-off). This
produces three recurring problems:

1. **Filtering is heavy and always-on.** `ERPFilterBar` renders every filter control inline,
   always expanded (`ERPFilterBar.tsx`). On filter-rich pages this eats vertical space and there
   is no way to collapse it or see active filters at a glance — `useERPFilters` tracks
   `activeCount` but only surfaces it as a `↺ Clear (N)` button (`ERPFilterBar.tsx:276-286`).
2. **The table footer shifts.** `ERPTable` keeps the footer at the bottom *only if* the caller
   passes a `maxHeight` so `tbody` scrolls internally (`ERPTable.tsx:503-506`). With no
   `maxHeight`, the body grows with row count and the pagination footer slides down the page —
   its position depends on data volume. The global search has **no debounce**
   (`ERPTable.tsx:433-437` sets state on every keystroke), there is **no "Page N of M" label**
   (only a `from–to of total` record range, `:728-730`), and the **rows-per-page selector is
   scaffolded but never rendered** (`pageSizes`/`handlePageSize` exist at `:351,:468` but the
   footer JSX `:725-731` omits the control).
3. **No modal system.** Only low-level Radix wrappers exist (`dialog.tsx`, `alert-dialog.tsx`).
   There is no `ConfirmModal` / `FormModal` / `DetailModal` and no consistent open/close API, so
   every consumer hand-wires `useState(open)` + primitive composition (`example-modal.tsx`,
   `AssignmentModal.tsx`). Destructive confirmations, form dialogs, and read-only detail views
   are reinvented per page with divergent behavior.

This spec hardens the three table/filter primitives and introduces a small, consistent modal
system, so every page composes the same well-behaved building blocks.

---

## Current-state audit (build vs improve)

| Capability | Component | Status today | This spec |
|------------|-----------|--------------|-----------|
| Filter controls (select/multiselect/search/boolean/searchselect/daterange) | `ERPFilterBar` | ✅ exists (`:23-38`) | keep |
| Active-filter count + clear-all | `useERPFilters` | ✅ `activeCount`, `reset` (`:42-60`) | keep, resurface |
| Collapse/expand filter panel | `ERPFilterBar` | ❌ always expanded | **build** |
| Active filters as label+count badges | `ERPFilterBar` | ❌ none | **build** |
| Global search box | `ERPTable` | ✅ (`:577-609`) | keep |
| Debounced search | `ERPTable` | ❌ instant (`:433-437`) | **improve** |
| CSV + Excel export | `ERPTable`, `ERPTreeTable` | ✅ (`:108-137`, tree `:84-101`) | keep |
| Pagination first/prev/next/last + numbers | `ERPTable` | ✅ (`:712-731`) | keep |
| "Page N of M" label | `ERPTable` | ❌ only record range | **improve** |
| Rows-per-page selector | `ERPTable` | ❌ scaffolded, not rendered | **improve** |
| Footer never shifts (any row count) | `ERPTable`, `ERPTreeTable` | ⚠️ only if `maxHeight` passed | **improve** |
| Expand/collapse hierarchical rows | `ERPTreeTable` | ✅ (`canExpand`/`expandedRow`, `:46-51`) | keep |
| TreeTable search/export/pagination parity | `ERPTreeTable` | ⚠️ partial | **improve** |
| Low-level dialog primitives | `dialog.tsx`, `alert-dialog.tsx` | ✅ Radix wrappers | keep as base |
| `ConfirmModal` (yes/no/destructive) | — | ❌ none | **build** |
| `FormModal` (validation state) | — | ❌ none | **build** |
| `DetailModal` (read-only) | — | ❌ none | **build** |
| Consistent open/close API across modals | — | ❌ per-page `useState` | **build** |

---

## Acceptance criteria

### 1. Collapsible filter panel (`ERPFilterBar`)
- [ ] The filter bar can **collapse and expand**; collapsed by default when no filter is active,
      expanded state persists per-page within the session (component state, not localStorage).
- [ ] When collapsed, each **active** filter renders as a **badge** showing `label: value`
      (or `label (N)` for multiselect with N selected); inactive filters are hidden.
- [ ] Each badge is itself an **active-filter control**: clicking its `×` clears that one filter;
      clicking the badge body re-opens the panel focused on that filter.
- [ ] A header row shows the active-filter count and a **Clear all** action (reuses
      `useERPFilters.reset`); Clear all is hidden when `activeCount === 0`.
- [ ] Expand/collapse is keyboard-accessible (button with `aria-expanded`) and uses an existing
      primitive for the trigger — no new one-off button primitive.
- [ ] `useERPFilters` / `applyERPFilters` public API is unchanged (no consumer page edits required
      beyond opting into the new panel); all 21 current consumers keep working.

### 2. DataTable (`ERPTable`)
- [ ] **Global search is debounced** (250 ms default, configurable via `searchDebounceMs`); the
      input stays responsive while filtering is deferred. Clearing search is immediate.
- [ ] Footer shows a **`Page N of M`** label in addition to the existing `from–to of total`
      record range.
- [ ] Footer renders a **rows-per-page selector** (`pageSizes`, default `[10,25,50,100]`,
      `defaultPageSize=25`) wired to `handlePageSize`; changing it resets to page 1.
- [ ] Pagination controls present: **first («), prev, page numbers (with … truncation), next,
      last (»)** — first/last/prev/next disabled correctly at bounds (already present; verified).
- [ ] **The footer position NEVER shifts regardless of row count.** The table body scrolls
      internally and the footer is pinned to the bottom of the table container **by default**
      (no longer dependent on the caller passing `maxHeight`). With 1 row or 10,000 rows the
      footer sits in the same place.
- [ ] Excel (`.xlsx`) and CSV export remain; export reflects the **filtered + searched** set
      (not just the current page) and respects column `value`/`render` accessors.
- [ ] No new data-fetching/state library is introduced (CLAUDE.md). Table state stays local.

### 3. TreeTable (`ERPTreeTable`)
- [ ] All DataTable criteria above (debounced search, `Page N of M`, rows-per-page selector,
      non-shifting footer, filtered export) apply equally to `ERPTreeTable`.
- [ ] **Expand/collapse of hierarchical rows** is preserved (`canExpand`, `expandedRow`,
      `expandIndent`) and works together with pagination (expanded children do not break the
      fixed-footer/scroll behavior).
- [ ] Expand-all / collapse-all control in the toolbar.
- [ ] CSV/XLSX export excludes the synthetic `_expand` column (already handled, `:85,:99`) and
      flattens visible hierarchy in a documented order.

### 4. Modal system (3 reusable types, one API)
- [ ] A single `modal/` folder exposes **`ConfirmModal`**, **`FormModal`**, **`DetailModal`**,
      all built on the existing Radix `dialog.tsx` / `alert-dialog.tsx` base.
- [ ] **Consistent open/close API** across all three: each is controlled via
      `{ open: boolean; onClose: () => void }` plus a `title` and optional `description`; none
      manage their own visibility internally. A `useModal()` helper returns
      `{ open, openModal, closeModal }` for the common imperative case.
- [ ] **`ConfirmModal`** — yes/no with a `variant: 'default' | 'destructive'`; destructive uses
      the danger affordance, a confirm-label override, an async `onConfirm` that shows a pending
      state and auto-closes on success / surfaces error on reject. Built on `alert-dialog.tsx`.
- [ ] **`FormModal`** — wraps arbitrary form content; exposes a **validation/submit state**
      (`submitting`, `isValid`, `error`); the primary action is disabled while invalid or
      submitting; submit errors render inline without closing; ESC/overlay-close is blocked while
      submitting. Built on `dialog.tsx`.
- [ ] **`DetailModal`** — read-only view; no submit action, a single Close affordance; supports a
      header, sectioned body (label/value pairs), and optional footer actions slot.
- [ ] All three: focus-trap + ESC + overlay click to close (inherited from Radix), `aria` roles,
      and scroll-lock; closing always routes through `onClose` (no divergent close paths).
- [ ] **Proof of reuse:** the one-off `AssignmentModal.tsx` (391 lines) is refactored onto
      `FormModal`, demonstrating net code reduction and identical behavior.

### 5. Error states & developer feedback
- [ ] When an API call fails (network error, 500, 401, 403, 404), the table/page area renders a
      **professional error state** in place of the data — never a browser `alert()`. Three
      variants:
      - **unauthorized** (401/403) — redirect to login (401, existing apiClient behavior) or an
        in-place "You don't have access to this data" state (403);
      - **not-found** (404) — "not found" state with a back/retry affordance;
      - **server-error** (5xx / network) — shows the error code, a timestamp, and the request ID
        when available.
- [ ] In development (`NODE_ENV=development`) every error state additionally renders a
      **technical panel**: HTTP status, endpoint URL, a response-body snippet, and a
      **copy-to-clipboard** button that copies the full normalized error. In production builds
      this panel is **not rendered** (stripped by the env check, not merely hidden with CSS).
- [ ] All API errors are caught **at the `apiClient` level** (axios interceptor in
      `lib/api/client.ts`) and normalized to one consistent shape before reaching components:
      `ErrorResponse { status, message, endpoint, timestamp }`. Components never parse raw
      axios/fetch errors — they branch only on the normalized `status`.

### Cross-cutting
- [ ] No new npm dependency: reuse installed `@radix-ui/react-dialog`, `@tanstack/react-table`
      (only if already used internally), and `xlsx`. (Verified present in `package.json`.)
- [ ] Components remain `"use client"` and follow the existing inline-style + `components/ui/`
      conventions; colors grouped in local style maps so a later token swap (spec-frontend-001)
      is mechanical.
- [ ] No emojis introduced; icons are explicitly-sized SVG (DESIGN-SYSTEM.md).
- [ ] `pnpm build` and `pnpm lint` pass with no new errors; all 21 existing consumer pages render
      unchanged unless they opt into a new feature.

---

## Out of scope

- **Backend / API / Prisma changes** — none. Frontend component layer only.
- **Server-side pagination / virtualized rows** — tables stay client-paginated over the data the
  page already fetched. (Virtualization is a future spec if row counts demand it.)
- **The theming refactor** — colors stay as-is (literals); see spec-frontend-001.
- **Migrating tables to `@tanstack/react-table`** wholesale — the existing hand-rolled engine
  stays unless a specific criterion needs the lib; no rewrite.
- **Replacing `SearchSelect` / `ERPDatePicker`** — reused as-is inside the filter panel.
- **A generic “DataGrid” with inline editing, column resize/reorder, or saved views** — not now.
- **Toast / notification system** — separate concern, separate spec.

---

## Data model changes

None. No Prisma schema, no database, no migrations.

---

## Component API contracts

No HTTP endpoints. The "contract" here is the public props/return surface of each component.
Existing exported signatures (`ERPColumn`, `ERPFilter`, `useERPFilters`, `applyERPFilters`,
`ERPTreeColumn`, …) are **additively** extended — no breaking changes to current consumers.

### `ERPFilterBar` (extended)
```ts
interface ERPFilterBarProps<T> {
  // ...existing: filters, values, onChange, onReset, activeCount
  collapsible?: boolean;          // default true
  defaultCollapsed?: boolean;     // default: collapsed when activeCount === 0
  onClearFilter?: (key: string) => void; // per-badge clear
}
```

### `ERPTable` / `ERPTreeTable` (extended)
```ts
interface ERPTableProps<T> {
  // ...existing: data, columns, filters, pageSizes, defaultPageSize, exportFilename, ...
  searchDebounceMs?: number;      // default 250
  showPageOfM?: boolean;          // default true
  showRowsPerPage?: boolean;      // default true
  stickyFooter?: boolean;         // default true — footer pinned, body scrolls
  fillHeight?: boolean;           // default true — container claims available height
}
// ERPTreeTable additionally:
interface ERPTreeTableProps<T> {
  // ...existing: canExpand, expandedRow, expandIndent
  defaultExpandedAll?: boolean;   // expand-all initial state
}
```

### Modal system (new)
```ts
// useModal — imperative helper
function useModal(initial?: boolean): { open: boolean; openModal(): void; closeModal(): void };

interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
}
interface ConfirmModalProps extends BaseModalProps {
  variant?: 'default' | 'destructive';
  confirmLabel?: string;          // default "Confirm"
  cancelLabel?: string;           // default "Cancel"
  onConfirm: () => void | Promise<void>; // pending state while awaiting
}
interface FormModalProps extends BaseModalProps {
  submitLabel?: string;           // default "Save"
  submitting?: boolean;
  isValid?: boolean;              // primary disabled when false
  error?: string | null;         // inline, non-closing
  onSubmit: () => void | Promise<void>;
  children: React.ReactNode;      // form fields
}
interface DetailModalProps extends BaseModalProps {
  children: React.ReactNode;      // read-only body
  footer?: React.ReactNode;       // optional actions slot
}
```

### Error normalization (new — see criteria §5)
```ts
// lib/api/client.ts — response interceptor normalizes every failure to:
interface ErrorResponse {
  status: number;     // HTTP status; 0 for network/timeout errors
  message: string;    // human-readable, from response body when present
  endpoint: string;   // request URL (path + query)
  timestamp: string;  // ISO-8601, client-side capture time
  requestId?: string; // from response headers when the backend provides one
  body?: unknown;     // response-body snippet — dev-panel use only
}

// components/ui/ErrorState.tsx — in-place error rendering
interface ErrorStateProps {
  error: ErrorResponse;
  variant?: 'unauthorized' | 'not-found' | 'server-error'; // derived from status when omitted
  onRetry?: () => void;
}
```

---

## Implementation notes

### Files involved
- `components/ui/ERPFilterBar.tsx` — add collapse/expand + badge rendering; keep `useERPFilters`.
- `components/ui/ERPTable.tsx` — debounce search, `Page N of M`, render rows-per-page select,
  make sticky footer + fill-height the default.
- `components/ui/ERPTreeTable.tsx` — mirror ERPTable changes; add expand-all/collapse-all.
- `components/ui/modal/ConfirmModal.tsx` *(new)*, `FormModal.tsx` *(new)*,
  `DetailModal.tsx` *(new)*, `useModal.ts` *(new)* — built on `dialog.tsx` / `alert-dialog.tsx`.
- `app/inventory/stock-reconciliation/[id]/AssignmentModal.tsx` — refactor onto `FormModal`
  (proof of reuse).
- `components/examples/example-modal.tsx`, `components/examples/example-table.tsx` — update to
  demonstrate the new APIs.
- `lib/api/client.ts` — response interceptor normalizing failures to `ErrorResponse` (§5); keep
  the existing 401→login redirect.
- `components/ui/ErrorState.tsx` *(new)* — unauthorized / not-found / server-error variants +
  dev-only technical panel with copy-to-clipboard.

### Libraries (all already installed — verified in `package.json`)
- `@radix-ui/react-dialog ^1.1.15` — modal base (focus trap, ESC, overlay, scroll-lock).
- `xlsx ^0.18.5` — Excel export (already used via dynamic `import('xlsx')`).
- `@tanstack/react-table ^8.21.3` — present; use only if an internal need arises, not a rewrite.

### Fixed-footer mechanism
Container is `display:flex; flex-direction:column` with the body region `flex:1; overflow-y:auto`
and `thead`/`footer` `flex-shrink:0`. The container claims a bounded height (`fillHeight`) so the
body — not the page — scrolls. This makes "footer never shifts" structural, not caller-dependent.

### Recommended sequencing
1. Modal system + `useModal` (self-contained, unblocks other UI work) → refactor `AssignmentModal`.
2. DataTable hardening (debounce, Page N of M, rows-per-page, sticky footer).
3. TreeTable parity (inherit DataTable changes + expand-all).
4. Collapsible filter panel + badges.

Each step is independently shippable and leaves all 21 consumers working.

---

## Verification checklist

```bash
cd frontend

# 1. New modal components exist with a single open/close contract
ls components/ui/modal/ConfirmModal.tsx components/ui/modal/FormModal.tsx \
   components/ui/modal/DetailModal.tsx components/ui/modal/useModal.ts
grep -lE "open:\s*boolean" components/ui/modal/*.tsx | wc -l   # Expected: >= 3

# 2. Search debounce present
grep -nE "searchDebounceMs|setTimeout|useDeferredValue|debounce" components/ui/ERPTable.tsx | head
# Expected: >= 1 match

# 3. Page N of M + rows-per-page rendered
grep -nE "of \{?total|Page .* of|rows per page|pageSizes\.map|<select" components/ui/ERPTable.tsx | head
# Expected: page-of-M label and a rendered <select> for page size

# 4. Sticky/fill-height footer is the default
grep -nE "stickyFooter|fillHeight|overflowY|flexShrink" components/ui/ERPTable.tsx | head
# Expected: body overflow-y auto + footer flex-shrink:0, defaulted on

# 5. Filter panel collapsible + badges
grep -nE "aria-expanded|collaps|badge|onClearFilter" components/ui/ERPFilterBar.tsx | head
# Expected: collapse toggle + per-filter badge/clear

# 6. AssignmentModal refactored onto FormModal (proof of reuse → fewer lines)
grep -nE "FormModal" "app/inventory/stock-reconciliation/[id]/AssignmentModal.tsx"
wc -l "app/inventory/stock-reconciliation/[id]/AssignmentModal.tsx"   # Expected: notably < 391

# 7. No new dependency added
git diff --stat package.json || echo "package.json unchanged"
# Expected: no new dep (radix-dialog / xlsx already present)

# 8. Build + lint
pnpm build && pnpm lint
# Expected: pass, no new errors

# 9. MANUAL: a 5-row table and a 5,000-row table show the footer in the same screen position.
# 10. MANUAL: collapse filter panel → active filters appear as badges; ×-clear works; Clear all resets.
# 11. MANUAL: ConfirmModal destructive variant, FormModal validation/submit-error, DetailModal read-only — all open/close via the same API.
```

---

## Status log

| Date | Status | Note |
|------|--------|------|
| 2026-06-04 | Active | Spec authored from live audit of `ERPTable` (732 L), `ERPFilterBar` (289 L), `ERPTreeTable` (413 L), `dialog.tsx`/`alert-dialog.tsx`. Build-vs-improve matrix recorded. Independent of spec-frontend-001. |
| 2026-06-04 | Active | Added §5 "Error states & developer feedback": in-place error variants (401/403, 404, 5xx), dev-only technical panel with copy-to-clipboard, and apiClient-level `ErrorResponse` normalization. Contracts + files-involved updated accordingly. |
| 2026-06-07 | Complete | §5 error states shipped (`ab64757`): `lib/api/errors.ts` (ErrorResponse + normalizeError/asErrorResponse/variantForStatus); apiClient interceptor attaches `error.normalized` after the spec-034 401-refresh flow (raw error still rejected for back-compat); `components/ui/ErrorState.tsx` with unauthorized/not-found/server-error variants + retry + DEV-only technical panel (copy-to-clipboard) — verified ABSENT from the prod bundle (NODE_ENV dead-code elimination, not CSS-hidden); wired into /settings/notifications as the reference. All of spec-frontend-002 (§1–§5) now shipped; build green; no new deps. Page-by-page adoption of the modal/ConfirmModal + ErrorState across the P1–P4 roadmap (spec-frontend-003) remains as separate follow-up work. |
| 2026-06-07 | Active | Implemented the recommended sequence, one commit per step. **Step 1** modal system (`components/ui/modal/`: ModalShell on @radix-ui/react-dialog, ConfirmModal/FormModal/DetailModal + useModal) sharing ONE style language (`modal/styles.ts`) with the InactivityGuard (refactored to import it); AssignmentModal refactored onto FormModal (393→326 L) as proof of reuse (`b6b5952`). **Step 2** ERPTable hardening: debounced search (`searchDebounceMs` 250, responsive input/deferred filter), footer `Page N of M` + rows-per-page selector, non-shifting footer by default (`fillHeight`), + bug fix so search composes on the filtered set and export reflects filtered+searched (`e2cdda5`). **Step 3** ERPTreeTable parity (debounce, Page N of M, rows-per-page, expand-all/collapse-all, `defaultExpandedAll`) (`aef2b7a`). **Step 4** ERPFilterBar collapsible + active-filter badges (header toggle w/ aria-expanded, per-badge clear, Clear all) (`ab25e6e`). No new deps (package.json unchanged); prod build green after every step; 13 PrintButton surfaces intact; all consumers keep working. **§5 (error states / ErrorState / apiClient ErrorResponse normalization) NOT in the recommended sequence — deferred to a follow-up.** Spec stays Active until §5 lands. |

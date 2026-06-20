# spec-ux-t5-sales — Tier 5 (Sales) reconstruction

> Parent: [[spec-ux-foundation]] · Depends on: **F0 (shipped)**, [[spec-ux-t4-manufacturing]]
> Status: **Complete** · Started + finished 2026-06-20

## Problem

Tier 5 of the UX reconstruction roadmap: the three sales pages. All score 2 — each hand-rolls
**both** its list `<table>` and its create/edit form, and uses raw `<select>` for FK/enum
dropdowns. No emoji, no native `alert()` (cleaner than procurement). `ConfirmModal` already
guards the destructive status actions on sales-orders/invoices (spec-frontend-003).

## Acceptance criteria (per page)

- [ ] List via `ERPTable` + `ERPFilterBar` (`useERPFilters`/`applyERPFilters`) — no hand-rolled `<table>`
- [ ] Create/edit via `FormModal` — no hand-rolled modal
- [ ] No raw `<select>` — all FK/enum dropdowns are `SearchSelect`
- [ ] Destructive/status actions via `ConfirmModal` (already in place); `PrintButton` preserved
- [ ] No pictographic emoji; tokens-with-fallback (no new hardcoded hex) · `tsc` 0 · `pnpm build` green

## Tasks (roadmap order)

- [x] **T5.1 customers** (score 2) — ERPTable + ERPFilterBar; hand-rolled form → FormModal; SearchSelect ×2; delete → ConfirmModal. **Cx M** — `001d428`
- [x] **T5.2 sales-orders** (score 2) — ERPTable (expandable-row detail → row-click ModalShell); FormModal; SearchSelect ×4 (status filter, customer, currency, line item). **Cx L** — `8aedc5b`
- [x] **T5.3 invoices (AR)** (score 2) — ERPTable (lines+payments detail → row-click ModalShell); payment + create modals → FormModal; SearchSelect ×4. **Cx L** — `2c59cbe`

**3/3 shipped — tier 5 complete.** Each task shipped as its own commit. KPI cards,
ConfirmModal status guards, and PrintButton (statement/invoice/receipt) preserved throughout.

## Out of scope

- Backend/API changes; tier 6+ pages; rewriting already-compliant `ConfirmModal`/`PrintButton` usage.

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Sub-spec created from parent roadmap. Starting T5.1 (customers). |
| 2026-06-20 | Shipped all 3 (T5.1–T5.3). 3 hand-rolled tables → ERPTable (2 expandable → row-click ModalShell detail); 3 hand-rolled forms + 2 payment/create modals → FormModal; 10 raw `<select>` → SearchSelect; customers delete → ConfirmModal. Full tsc 0, prod build green. **3/3 — tier 5 complete.** |

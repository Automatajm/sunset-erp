# spec-ux-t6-finance — Tier 6 (Finance) reconstruction

> Parent: [[spec-ux-foundation]] · Depends on: **F0 (shipped)**, [[spec-ux-t5-sales]]
> Status: **Complete** · Started + finished 2026-06-20

## Problem

Tier 6 of the UX reconstruction roadmap: the eight finance pages — the largest tier. Most
hand-roll their tables/forms; `chart-of-accounts` hand-rolls an account **hierarchy** that
should be an `ERPTreeTable`. Gaps: raw `<select>` → `SearchSelect`, hand-rolled tables →
`ERPTable`/`ERPTreeTable`, hand-rolled forms → `FormModal`, status glyphs (`✓✗✕`) → SVG.
`ConfirmModal` already guards destructive actions on the CRUD pages (spec-frontend-003).

## Acceptance criteria (per page)

- [ ] List via `ERPTable` (or `ERPTreeTable` for hierarchy) + `ERPFilterBar` — no hand-rolled `<table>`
- [ ] Create/edit via `FormModal` — no hand-rolled modal
- [ ] No raw `<select>` — all FK/enum dropdowns are `SearchSelect`
- [ ] No pictographic emoji / dingbats (`✓ ✗ ✕`)
- [ ] Destructive actions via `ConfirmModal` (already in place); tokens-with-fallback · `tsc` 0 · `pnpm build` green

## Tasks (worst-score-first)

- [x] **T6.1 chart-of-accounts** (score 2) — hand-rolled hierarchy → `ERPTreeTable` (roots as rows, descendants recursively in the expand panel, filter-aware subtree visibility); SearchSelect ×4; FormModal; ConfirmModal. **Cx L** — `a0df6ca`
- [x] **T6.2 journal-entries** (score 2) — ERPTable (line detail → row-click ModalShell); FormModal; SearchSelect ×3; `✓✗` → SVG. **Cx L** — `609b694`
- [x] **T6.3 budgets** (score 2) — `ERPTreeTable` (master-detail panel inline via expandedRow); FormModal ×2; SearchSelect ×3. **Cx L** — `60adedb`
- [x] **T6.4 fiscal-periods** (score 2) — ERPTable + ERPFilterBar; FormModal; SearchSelect ×4. **Cx M** — `b0f62c8`
- [x] **T6.5 je-queue** (score 2) — SearchSelect ×1; `✓✕` → SVG. Queue layout kept (see note). **Cx M** — `cc956c4`
- [x] **T6.6 automation** (score 3) — `✓` → SVG. **Cx S** — `670c40e`
- [x] **T6.7 cash-flow** (score 3) — SearchSelect ×2. **Cx S** — `0568899`
- [x] **T6.8 reports** (score 3) — `✓✗` dropped. **Cx S** — `cd15427`

**8/8 shipped — tier 6 complete.** Each task shipped as its own commit.

> **je-queue note:** the JE approval queue is a specialized grouped/card review surface,
> not a flat CRUD list — `ERPTable` doesn't fit it cleanly. The de-emoji + SearchSelect wins
> shipped; the table conversion is intentionally not forced (would degrade the queue UX).

## Out of scope

- **Budgets roll-forward automation** — the parent roadmap pairs budgets with an
  "auto-create next-period budget from prior" feature. That is a backend + UI feature, not a
  pure UX reconstruction; it is **deferred to its own spec** and noted here so it isn't lost.
- Backend/API changes; tier 7 pages.

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Sub-spec created from parent roadmap. Starting T6.1 (chart-of-accounts). |
| 2026-06-20 | Shipped all 8 (T6.1–T6.8). 2 hierarchies → ERPTreeTable (COA accounts, budgets master-detail); 2 hand-rolled tables → ERPTable (journal-entries, fiscal-periods); 6 hand-rolled modals → FormModal; 17 raw `<select>` → SearchSelect; all `✓✗✕` glyphs → SVG/text. Full tsc 0, prod build green. **8/8 — tier 6 complete.** Budgets roll-forward automation deferred to its own spec; je-queue table conversion intentionally not forced (queue UX). |

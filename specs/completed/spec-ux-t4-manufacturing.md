# spec-ux-t4-manufacturing — Tier 4 (Manufacturing) reconstruction

> Parent: [[spec-ux-foundation]] · Depends on: **F0 (shipped)**, [[spec-ux-t3-procurement]]
> Status: **Complete** · Started + finished 2026-06-20

## Problem

Tier 4 of the UX reconstruction roadmap: the manufacturing pages. `work-centers` was already
brought to standard in T2.4. The remaining four:
- **production-orders** (score 2) hand-rolls its list `<table>` — needs `ERPTable`.
- the rest already use `ERPTable`/`ERPTreeTable`; gaps are raw `<select>` → `SearchSelect`
  and pictographic emoji → inline SVG.

## Acceptance criteria (per page)

- [ ] List via `ERPTable`/`ERPTreeTable` — no hand-rolled `<table>` (production-orders)
- [ ] No raw `<select>` — all FK/enum dropdowns are `SearchSelect`
- [ ] No pictographic emoji / dingbats (`⚠ ⚡ ✓ 📦 ⚙ 📋`)
- [ ] Destructive actions via `ConfirmModal` (already in place); inline error feedback
- [ ] Tokens-with-fallback (no new hardcoded hex) · `tsc` 0 · `pnpm build` green

## Tasks (worst-score-first)

- [x] **T4.1 production-orders** (score 2) — hand-rolled expandable table → `ERPTable`
      (actuals panel now opens on row-click in a `ModalShell`); SearchSelect ×3; drop `⚠⚡✓📦`;
      104 hex already tokens-with-fallback (F0). **Cx L** — `dcf9e39`
- [x] **T4.2 production-plans** (score 3) — SearchSelect ×4; drop `⚡✓`. **Cx M** — `a7bb673`
- [x] **T4.3 bom** (score 4) — SearchSelect ×1; drop `⚙⚠✓📋`. **Cx S** — `0e36a3e`
- [x] **T4.4 boms** (score 4) — SearchSelect ×1; drop `⚙⚠✓📋`. **Cx S** — `cb5835d`

**4/4 shipped — tier 4 complete.** Each task shipped as its own commit.

> **Out-of-scope finding (logged, not fixed):** `bom`/`boms` carry residual **Spanish UI
> strings** ("no configurado", "No hay UOMs de tipo…", "selecciona grupo", "grupo sin UOM").
> The de-emoji edits preserved the text verbatim. Translating these is a separate i18n pass
> (DESIGN-SYSTEM rule: UI English-only) — recommend a dedicated cleanup spec.

## Out of scope

- Backend/API changes; `work-centers` (done in T2.4); tier 5+ pages.

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Sub-spec created from parent roadmap. Starting T4.1 (production-orders). |
| 2026-06-20 | Shipped all 4 (T4.1–T4.4). production-orders' hand-rolled expandable table → ERPTable + row-click actuals modal; 10 raw `<select>` across the tier → SearchSelect; all `⚡📦⚠✓⚙📋` glyphs → SVG/text. Full tsc 0, prod build green. **4/4 — tier 4 complete.** Logged residual Spanish strings in bom/boms as out-of-scope. |

# spec-ux-t3-procurement — Tier 3 (Procurement) reconstruction

> Parent: [[spec-ux-foundation]] · Depends on: **F0 (shipped)**, [[spec-ux-t2-master-data]]
> Status: **Complete** · Started + finished 2026-06-20

## Problem

Tier 3 of the UX reconstruction roadmap: the eight procurement pages. Unlike tier 2, these
**already use `ERPTable`** — the remaining gaps are narrower and mostly surgical:
- raw `<select>` → `SearchSelect` (every FK/enum dropdown)
- pictographic emoji / dingbats → inline SVG or text
- the **3 remaining native `alert()`** calls (purchase-requisitions, rfqs, general-needs) →
  inline/absorbed feedback
- suppliers' hand-rolled create modal → shared `FormModal`

## Acceptance criteria (per page)

- [ ] No raw `<select>` — all FK/enum dropdowns are `SearchSelect`
- [ ] No pictographic emoji / dingbats (`★ ⭐ 🔒 🏆 ✓ ✕ ✗ ✏ 📤 🔄 🔴 🟠 📋 ⚠`)
- [ ] No native `alert()`/`confirm()` — inline `ErrorState`/absorbed errors + `ConfirmModal`
- [ ] Create/edit via `FormModal` where a hand-rolled modal exists (suppliers)
- [ ] Tokens-with-fallback (no new hardcoded hex) · `tsc` 0 · `pnpm build` green

## Tasks (worst-score-first)

- [x] **T3.1 suppliers** (score 2) — SearchSelect ×7; hand-rolled create modal → FormModal; drop `★⭐🔒`. **Cx L** — `ef2e641`
- [x] **T3.2 purchase-requisitions** (score 2) — **killed native `alert()`**; SearchSelect ×4; drop `✓✕📤🔄🔴🟠`. **Cx M** — `d0d449f`
- [x] **T3.3 supplier-items** (score 3) — SearchSelect ×3; drop `★✓`. **Cx M** — `ebe1529`
- [x] **T3.4 rfqs** (score 3) — SearchSelect ×4; drop `✓🏆`. (No live alert — audit hit was a comment.) **Cx M** — `1245cea`
- [x] **T3.5 purchase-orders** (score 3) — SearchSelect ×4; drop `✓`. **Cx M** — `b3c7414`
- [x] **T3.6 general-needs** (score 3) — SearchSelect ×4; drop `✓`. (No live alert — comment.) **Cx M** — `033c5d4`
- [x] **T3.7 ap-invoices** (score 3) — SearchSelect ×5; drop `⚠✏✓✗📋`. **Cx M** — `191a3bb`
- [x] **T3.8 goods-receipts** (score 3) — SearchSelect ×2; drop `⚠✓`. **Cx M** — `7e0df94`

**8/8 shipped — tier 3 complete.** Status-glyph `✓` → text or inline SVG check;
`✕`/`✗` → inline SVG X; decorative `★⭐🏆🔒📤🔄📋✏🔴🟠⚠` → SVG or removed.
Note: the "kill alert()" items for rfqs/general-needs were stale — those pages' only
`alert` occurrences were code comments; the one real native `alert()` (purchase-requisitions)
was replaced with an inline `actionError` banner.

## Out of scope

- Backend/API changes; tier 4+ pages; rewriting already-compliant `ERPTable`/`ConfirmModal` usage.

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Sub-spec created from parent roadmap. Starting T3.1 (suppliers). |
| 2026-06-20 | Shipped all 8 (T3.1–T3.8). suppliers' tabbed modal → FormModal; 33 raw `<select>` across the tier → SearchSelect; the one live native `alert()` → inline banner; all status/decorative emoji → inline SVG or text. Full tsc 0, prod build green. **8/8 — tier 3 complete.** |

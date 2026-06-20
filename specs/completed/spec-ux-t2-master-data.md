# spec-ux-t2-master-data — Tier 2 (Master Data) reconstruction

> Parent: [[spec-ux-foundation]] · Depends on: **F0 (shipped)**
> Status: **Complete** · Started + finished 2026-06-20

## Problem

Tier 2 of the UX reconstruction roadmap: bring the seven master-data pages up to the
component standard defined in spec-ux-foundation. Master data sits upstream of every other
flow, so it is reconstructed first. The shared primitives already exist — this is adoption,
not invention.

## Acceptance criteria (per page)

A page is "done" when:
- [ ] Wrapped in `ERPShell` (already true for all tier-2 pages)
- [ ] List rendered via `ERPTable` (`ERPColumn<T>`, sortable, CSV export, paging) — no hand-rolled `<table>`
- [ ] Filters via `ERPFilterBar` + `useERPFilters` + `applyERPFilters` — no inline filter state
- [ ] Every FK / enum dropdown is a `SearchSelect` — no raw `<select>`
- [ ] Create/edit via `FormModal` (or the page's established `ModalShell`-based modal) — destructive actions via `ConfirmModal`
- [ ] No pictographic emoji / dingbats (`✓ ⚠ ⚙ 💰` …) — use SVG or text
- [ ] Uses tokens (`var(--token, #hex)`) — no new hardcoded hex
- [ ] `tsc` clean + `pnpm build` green

## Tasks (worst-score-first, per roadmap)

- [x] **T2.1 settings/uom** (score 2) — read-only catalog. ERPTable ×2 (units, conversions);
      SearchSelect ×4 (converter from/to + type/system filters → FilterBar); drop `✓` dingbat.
      No CRUD (global seeded catalog). **Cx M** — shipped `8ea16b5`
- [x] **T2.2 inventory/macro-categories** (score 2) — ERPTable + FormModal; SearchSelect for any FK. **Cx M** — shipped `8675771`
- [x] **T2.3 inventory/categories** (score 2) — ERPTable + FormModal; SearchSelect ×2 (macro-category FK). Dep: T2.2 pattern. **Cx M** — shipped `ac301a2`
- [x] **T2.4 manufacturing/work-centers** (score 2) — ERPTable + FormModal; SearchSelect. **Cx M** — shipped `b45ea37`
- [x] **T2.5 inventory/items** (score 3) — SearchSelect ×2; drop `🔒 ⚠` emoji. (Large page — surgical, no full rewrite.) **Cx M** — shipped `7fced1c`
- [x] **T2.6 inventory/consumption-groups** (score 3) — de-emoji (`⚠`). Already gold-standard otherwise. **Cx S** — shipped `ba65978`
- [x] **T2.7 inventory/warehouses** (score 3) — SearchSelect ×2; drop `⚖` emoji. **Cx S** — shipped `8e2fbad`

Each task ships as its own commit. Reference idiom: `inventory/consumption-groups/page.tsx`.

**Progress: 7/7 shipped — tier 2 complete.**

## Out of scope

- Backend/API changes (master-data endpoints already shipped per their specs).
- Adding CRUD to read-only catalogs (uom units/conversions are seeded globally).
- Tier 3+ pages.

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Sub-spec created from parent roadmap. Starting T2.1 (uom). |
| 2026-06-20 | Shipped T2.1 (uom full rewrite), T2.5 (items), T2.6 (consumption-groups), T2.7 (warehouses). All tsc 0, prod build green (51 routes). 4/7 done; T2.2–T2.4 (CRUD table+modal rewrites) remain. |
| 2026-06-20 | Shipped T2.2 (macro-categories), T2.3 (categories), T2.4 (work-centers) — full hand-rolled table+modal → ERPTable + FormModal + ConfirmModal reconstructions. tsc 0, prod build green. **7/7 — tier 2 complete.** Notable: macro-categories delete guards on child categories via ConfirmModal's thrown-error surfacing; categories kept edit-only (parity with prior). |

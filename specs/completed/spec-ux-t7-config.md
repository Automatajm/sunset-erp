# spec-ux-t7-config — Tier 7 (Config) reconstruction

> Parent: [[spec-ux-foundation]] · Depends on: **F0 (shipped)**, [[spec-ux-t6-finance]]
> Status: **Complete** · Started + finished 2026-06-20 · **Final tier of the roadmap**

## Problem

Tier 7 — the last tier of the UX reconstruction roadmap: the six config/settings pages.
The headline gap is two pages (`roles`, `users`) that don't wrap in **`ERPShell`** at all
(the only such pages left in the app). The rest need table/select/emoji cleanup.
`notifications` is already compliant (`ERPTable`, no raw select, no emoji) — no work needed.

## Acceptance criteria (per page)

- [ ] Wrapped in `ERPShell` (roles, users currently bypass it)
- [ ] List via `ERPTable` + `ERPFilterBar` — no hand-rolled `<table>`
- [ ] No raw `<select>` — FK/enum dropdowns are `SearchSelect`
- [ ] No pictographic emoji / dingbats
- [ ] Destructive actions via `ConfirmModal` (already in place); tokens-with-fallback · `tsc` 0 · `pnpm build` green

## Tasks (worst-score-first)

- [x] **T7.1 settings/roles** (score 1) — **wrapped `ERPShell`**; card grid → `ERPTable` + ERPFilterBar. **Cx M** — `caa1658`
- [x] **T7.2 settings/users** (score 1) — **wrapped `ERPShell`**; grid table → `ERPTable` + ERPFilterBar. **Cx M** — `6c29c94`
- [x] **T7.3 settings/tenants** (score 2) — SearchSelect ×1; `🏢` → SVG. Master-detail layout kept (see note). **Cx M** — `2d3e24d`
- [x] **T7.4 settings/general** (score 3) — de-emoji (`⚠ ✓ ⚙ 🏷 📋 📦 🔄`). **Cx S** — `2ce9974`
- [x] **T7.5 settings/bulk-import** (score 3) — `✓` → SVG. **Cx S** — `db64075`
- [x] **settings/notifications** (score 4) — already compliant (ERPTable, no select/emoji). **No work.**

**6/6 done — tier 7 complete. ROADMAP COMPLETE.** Each task shipped as its own commit.

> **Layout notes:** `tenants` and `bulk-import` are specialized master-detail split-view
> settings surfaces, not flat CRUD lists — `ERPTable` doesn't fit them cleanly, so (like
> `je-queue` in T6) the de-emoji + SearchSelect wins shipped without forcing the table.

## Out of scope

- Backend/API changes; the bulk-import upload wizard flow (logic preserved, only emoji/UI touched).

## Status log

| Date | Change |
|------|--------|
| 2026-06-20 | Sub-spec created from parent roadmap. Starting T7.1 (roles). notifications already compliant. |
| 2026-06-20 | Shipped all 5 (T7.1–T7.5). roles + users wrapped in ERPShell (the last two pages bypassing it) and their hand-rolled tables → ERPTable; tenants select → SearchSelect + de-emoji; general + bulk-import de-emoji. Full tsc 0, prod build green. **6/6 — tier 7 complete. The UX reconstruction roadmap is fully shipped (F0 + tiers 2–7).** |

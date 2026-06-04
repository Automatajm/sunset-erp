---
name: demo-seed-generator
description: Generate a themed, internally-consistent demo seed for Sunset ERP from a real business scenario (e.g. "hamburger factory Dominican Republic"). Researches real ingredient data, prices, and volumes via web search, then writes an idempotent prisma/seeds/NN-demo-<theme>.seed.ts that seeds classification, UOM, items, suppliers, price lists, BOMs, customers, sales orders, purchase orders, journal entries, and budgets — all numerically coherent (BOM × volume = purchases; revenue − COGS = stated margin). Use when the user wants a realistic demo dataset, a themed tenant, or sales-pitch data. Do NOT run before the prerequisite specs are complete.
---

# Demo Seed Generator

Generate one complete, themed demo seed file for Sunset ERP from a real business
scenario. The output is a single `backend/prisma/seeds/NN-demo-<theme>.seed.ts` whose
data tells one coherent business story: every purchase traces to a BOM, every BOM to a
sale, every sale to a journal entry, and the totals reconcile to the peso.

## Input

A business theme — industry + geography, e.g. `hamburger factory Dominican Republic`,
`craft brewery Costa Rica`, `furniture workshop Santiago`. If the user gives no theme,
ask for one. Derive from it:
- a fictional but plausible company (name, legal form, city) — e.g.
  **Burger Borinquen S.R.L., Santo Domingo, DR**,
- the local currency (DR → `DOP`, prices written as RD$),
- 2–4 finished-good SKUs with realistic retail prices,
- a Year-1 daily production volume.

## Step 0 — gate on prerequisite specs (HARD STOP)

This skill seeds modules that must already be spec'd and implemented. Check
`specs/completed/` for specs covering: **macro-categories, categories,
consumption-groups, items, suppliers, BOM**. For each missing one, stop and tell the
user which specs are pending and to run `/new-spec <module>` first. Do not generate a
partial seed.

## Step 1 — research the scenario (web search)

Use web search to ground the data in reality. Find and record (with source URLs in code
comments):
1. **Recipe composition** — real ingredient lists with gram/unit quantities per SKU
   (e.g. a classic burger: bun 85 g, beef patty 150 g, cheddar slice 20 g, lettuce 15 g,
   tomato 25 g, onion 10 g, pickles 8 g, sauce 12 g).
2. **Real local prices** — current wholesale/retail prices in the local currency
   (e.g. RD$/kg for beef at Mercadom or local distributors; if only USD sources exist,
   convert at the current rate and note it).
3. **Realistic production volumes** — typical output for a business of that size
   (the reference scenario: 175 units/day Year 1).
4. **Real supplier landscape** — actual distributor names/types in that market to model
   fictional-but-plausible suppliers after (never use real company names verbatim —
   derive: "Mercasid" → "Distribuidora Caribe Foods S.R.L.").

If web search is unavailable, say so and ask the user to supply prices; do not invent
"realistic-looking" numbers silently.

## Step 2 — read the actual schema and conventions

Never invent model or field names:
- `backend/prisma/schema.prisma` — exact models, fields, and `@@unique` constraints for
  every entity you will seed. Upserts must target REAL unique constraints
  (most business tables: `@@unique([tenantId, code])`).
- `backend/prisma/seeds/04-demo-tenant.seed.ts` — the house idempotency pattern
  (`prisma.<model>.upsert({ where: { <constraint> }, update: {}, create: {...} })`,
  config interface at top, `console.log` progress lines).
- `backend/prisma/seed.ts` — the orchestrator; you will register the new seed there.
- Document-number formats from the services (`SUP-2026-0001` style) so seeded codes
  match what `generateCode` would produce next (seed `-0001…-000N`, leaving the
  sequence valid).

## Step 3 — build the data model (in dependency order)

One `const SCENARIO = {...}` block at the top of the seed holds ALL numbers — prices,
quantities, volumes, growth rates — so the story is auditable and editable in one place.
Seed in FK order:

1. **Classification** — macro-categories (e.g. `PROTEIN`, `BAKERY`, `PRODUCE`, `DAIRY`,
   `PACKAGING`, `FG`), categories under them, consumption-groups for MRP aggregation.
2. **UOM** — only units the recipes actually use (`g`, `kg`, `unit`, `slice`, `ml`, `L`)
   with correct conversion factors; reuse `cfg_uom_*` system units where they exist
   (see `prisma/seed-uom.ts` — the UOM catalog is seeded separately; require it first).
3. **Items** — every ingredient (raw materials, purchase/storage/consumption UOMs with
   real conversion factors, e.g. purchase `kg` → consumption `g` factor 1000) and every
   finished SKU (`isSaleable`, sales price). Real gram quantities from Step 1.
4. **Suppliers** — 4–6 DR-plausible suppliers (RNC-style tax IDs, Santo Domingo /
   Santiago addresses, +1-809 phones), each owning a coherent slice of the catalog
   (meat supplier, bakery, produce, packaging).
5. **Supplier-items** — price list rows: supplier × item × price in local currency ×
   purchase UOM × MOQ × lead time. These prices are THE cost basis for everything below.
6. **BOM / recipes** — one BOM per finished SKU (the technical data sheet): component
   items, quantity-per in consumption UOM, scrap %. Unit cost of a SKU =
   Σ(componentQty × componentUnitCost × (1 + scrap)) — computed in the seed, not
   hard-coded, so price edits propagate.
7. **Customers** — 6–10 themed customers (restaurants, colmados, distributors, a hotel)
   with credit terms.
8. **Sales orders** — a baseline year of orders matching the production volume
   (Year 1: dailyUnits × workingDays, distributed across customers and SKUs with a
   stated mix), then **+20% Year 2, +20% Year 3** (volume growth; keep prices flat or
   note the assumed increase). Use fixed dates derived from the scenario config — no
   `new Date()` randomness in quantities.
9. **Purchase orders** — DERIVED, never invented:
   `purchaseQty(ingredient) = Σ over SKUs (bomQty × unitsProduced × (1+scrap))`,
   rounded UP to the supplier's purchase UOM/MOQ. Group into monthly POs per supplier
   at supplier-item prices.
10. **Journal entries** — derived from the documents: sales → revenue (credit 4xxx) +
    COGS (debit 5xxx, at BOM cost) + AR; purchases → inventory (debit 1xxx) + AP.
    Use the tenant's existing chart of accounts; entries must balance (Σdebit = Σcredit
    per entry — assert it in the seed before writing).
11. **Budgets** — per-month budget rows aligned with the production plan: revenue
    budget = planned units × price mix; COGS budget = planned units × BOM cost;
    consistent with the +20%/+20% growth.

## Step 4 — internal consistency (the contract)

The seed must compute, not transcribe. Before writing rows, calculate and `assert`:
- `Σ(BOM component qty × production volume)` equals total purchased quantity per
  ingredient (after MOQ rounding, the difference is explicit "buffer stock", logged).
- `revenue − COGS` yields the stated gross margin: with ingredient cost ≈ 65% of
  revenue in the reference scenario, gross margin ≈ 35% — assert within ±2 pp.
- Every journal entry balances; period totals match the documents that generated them.
- Year 2 = Year 1 × 1.20 and Year 3 = Year 2 × 1.20 in units, exactly.

If an assertion fails, the seed throws before touching the DB — a demo dataset that
doesn't reconcile is worse than none.

## Step 5 — idempotency

- Every write is an `upsert` on a real unique constraint; generated documents
  (SOs, POs, JEs) use deterministic codes (`SO-2026-0001`…) so re-running updates
  instead of duplicating.
- Re-running the seed twice produces identical row counts (state this in the header
  and make it true).
- The seed never deletes; it only upserts within its own tenant. Seed a DEDICATED
  tenant (e.g. code `BURGER`) — never write demo data into `DEMO` or a real tenant.
- Reuse `04-demo-tenant.seed.ts`'s `seedTenant` pattern for the tenant + admin user
  (e.g. `admin@burger.do` / `Admin123!`).

## Step 6 — write + register

- File: `backend/prisma/seeds/NN-demo-<theme-slug>.seed.ts` where `NN` is the next free
  number (currently `05`). Export one `seedDemo<Theme>(prisma)` function.
- Register in `backend/prisma/seed.ts` after the existing seeds (import + call). Also
  note it can run standalone: `npx ts-node prisma/seeds/NN-demo-<theme>.seed.ts` if a
  `main()` guard is included.
- Header comment: theme, sources (URLs), date of price research, currency + FX rate
  used, and the one-paragraph business story.

## Step 7 — verification section (in the seed AND in the report)

End the seed with a `// ── Verification ──` block that re-queries the DB and prints the
reconciliation, e.g. for the reference scenario:

```
✔ 3 SKUs, 24 ingredients, 5 suppliers, 31 supplier-item prices
✔ 175 units/day × 26 days = 4,550 units/month Year 1
✔ Avg ticket RD$208.4 → monthly revenue RD$948,220
✔ BOM cost/unit: Classic RD$118.41 | BBQ RD$142.7 | Doble RD$159.2
✔ Ingredient cost = 64.8% of revenue (target 65% ±2pp)
✔ Journal entries: 24, all balanced (Σdebit = Σcredit)
✔ Year volumes: 54,600 / 65,520 / 78,624 units (+20%/+20%)
```

After running, report these numbers to the user with the formula behind each (e.g.
"175 units/day × RD$185 avg price = RD$32,375 daily revenue for the Classic line").

## Reference scenario (calibration example)

**Burger Borinquen S.R.L.** — hamburger factory, Santo Domingo, DR.
- Year 1: **175 units/day**, 26 working days/month.
- 3 SKUs: Classic **RD$185**, BBQ Bacon **RD$220**, Doble Queso **RD$245**
  (mix ~50/30/20).
- Ingredient cost ≈ **65% of revenue** → gross margin ≈ 35%.
- Growth: +20% Year 2, +20% Year 3 (volume).
Any generated scenario should hit this level of specificity.

## Rules

- Real schema names only — read `schema.prisma`; never guess a field.
- Real-world grounding only — prices/recipes from research, cited; no silent invention.
- All derived numbers computed in code from `SCENARIO`, single source of truth.
- Dedicated tenant per theme; never pollute `DEMO`.
- pnpm only; match repo style (2-space indent, section dividers `// ── … ──`).
- Seed file language: English identifiers/comments; business names may be themed
  (Spanish names for DR businesses are correct and expected).
- This skill writes ONE seed file + the orchestrator registration. It does not modify
  services, schema, or migrations. If the schema lacks a field the scenario needs
  (e.g. no budget model), drop that section and tell the user — do not improvise
  schema changes.

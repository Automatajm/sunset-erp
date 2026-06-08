# spec-frontend-001 — Theming Refactor (Semantic Tokens + Light Theme)

Status: **Deferred**  
Owner: Frontend / Design System  
Sprint: TBD (post Bloque 1 backend)  
Module(s): `frontend` — global styling layer, all `app/**` pages + `components/**`  
Last updated: 2026-06-04  

> ⛔ **Do not implement until Bloque 1 backend specs are complete.** This spec is a large
> cross-cutting frontend refactor (59/80 files touched). Implementing it mid-Bloque-1 would
> collide with active backend feature work and freeze the UI surface while pages are still
> being added. Sequence it after the foundational backend specs in
> [`specs/MODULE-CASCADE.md`](../MODULE-CASCADE.md) land. Acceptance criteria below are
> written but intentionally **all `- [ ]`** — nothing is started.

> Generated from a code audit of the live frontend (2026-06-04). The color counts in this
> spec are measured facts, not estimates. The raw inventory is in **Appendix A**.

---

## Purpose

- **Who uses this module?** Frontend developers, who get a single semantic-token layer to change colors instead of hunting thousands of inline literals — and, indirectly, every ERP end user, who benefits from visual consistency and a future light theme.
- **What business problem does it solve?** It replaces ~2,313 hardcoded color literals scattered across 74% of the frontend with a central token system, making theme changes, brand-color adjustments, and an accessible light mode possible from one place rather than impossible.
- **What can the business NOT do without this module?** It cannot offer a light theme, cannot guarantee WCAG-AA contrast, and cannot change its color identity without a manual, error-prone find-and-replace across dozens of files where the same hex serves several different meanings.

## Business value

Today the frontend looks like it supports theming but does not — colors are baked into every component as raw literals, so there is no switch to flip. That makes a light theme (a common client and accessibility expectation), a brand-color change, or a per-tenant palette effectively impossible without a multi-week refactor, and it leaves accessibility contrast unverifiable. Centralizing colors into semantic tokens turns these from "rebuild the UI" jobs into one-place edits, while a hard non-regression guarantee keeps the current dark theme pixel-identical so nothing breaks for existing users.

---

## Problem

The frontend is described as "dark-only" and the config *looks* like it has a theming layer —
`tailwind.config.ts` defines full Tremor light + dark token sets and `globals.css` has a
`.dark { --tremor-* }` block. **This is misleading.** An audit of the actual component code
found that none of that infrastructure is used by application code:

- **Colors are inline literals, not tokens.** ~**2,313 hex literals** (59 distinct values) and
  ~**200 distinct rgba values** are hardcoded directly inside `style={{}}` objects across
  **59 of 80 `.tsx` files** (~74%). Colors are typically declared in per-file local maps
  (e.g. `statusConfig = { critical: { color:'#f87171', bg:'rgba(248,113,113,0.12)' … } }`).
- **No central color/theme source exists.** A search for `*color*`, `*theme*`, `*palette*`,
  `*token*` files returned nothing. There is no single place to change a color.
- **Tailwind color utilities are essentially unused** — only **17** occurrences total
  (`text-white` ×12, `bg-white` ×2, `bg-black` ×2, `border-white` ×1).
- **Tremor tokens are dead.** `bg-tremor-*` / `text-tremor-*` / `--tremor-*` have **0 usages**
  in application code — they only affect the Tremor chart library internals. They cannot be
  reused as a theming base without verification and must not be mistaken for working infra.
- **Dark mode is hardcoded, not applied.** `app/layout.tsx:22` is a literal
  `<html className="dark h-full">`; `globals.css` sets `body { background:#0f172a; color:#f1f5f9 }`.
  `darkMode: "class"` is configured but the class never changes. There is **no** `next-themes`
  (not in `package.json`), **no** `data-theme` attribute, **no** `prefers-color-scheme`,
  **no** toggle, **no** persistence.

Measured coverage:

| Mechanism | Files using it | % of 80 |
|-----------|---------------:|--------:|
| `dark:` Tailwind prefix | 0 | 0% |
| CSS variables in components | 0 | 0% |
| Inline hex/rgba literal styles | 59 | ~74% |

**Consequence:** adding a light theme today is impossible without a refactor. There is no layer
to switch. A naive find/replace of hex values does not work because the same literal serves
multiple semantic roles (e.g. `#e2dfd8` is "primary text" in one place and a "border" in
another), and ~200 `rgba(255,255,255,0.0x)` overlays assume a dark backdrop — on a light
background they become invisible and must be re-derived as black overlays, not swapped.

This spec introduces a **semantic token layer** (CSS custom properties), migrates the inline
literals onto it, and adds a **theme switch** — with a hard non-regression guarantee that the
existing dark theme remains pixel-identical.

---

## Acceptance criteria

### Token foundation
- [ ] A semantic token set (~15–25 CSS custom properties) is defined in `globals.css` covering:
      backgrounds (`--bg-base`, `--bg-surface`, `--bg-surface-raised`), text
      (`--text-strong`, `--text`, `--text-muted`, `--text-subtle`), lines (`--border`,
      `--border-strong`), the orange accent (`--accent`, `--accent-strong`, `--accent-muted`),
      and status families (`--success*`, `--danger*`, `--warning*`, `--info*`, `--violet*`).
- [ ] Tokens are declared twice: a **dark** set (default / `[data-theme="dark"]`) and a
      **light** set (`[data-theme="light"]`). Dark values are the exact current literals
      (see Appendix A mapping) so dark is unchanged.
- [ ] A single source-of-truth TS module (`lib/theme/tokens.ts`) re-exports token names as
      typed constants so component code references `var(--token)` without raw strings drifting.

### Theme application & switching
- [ ] Theme is applied via `data-theme` on `<html>` (replacing the hardcoded `className="dark"`),
      not a literal class.
- [ ] A `ThemeProvider` (lightweight React context, ~30 lines — **no new state library**, per
      CLAUDE.md) reads/writes `localStorage` (`sunset-theme`) and falls back to
      `prefers-color-scheme` on first visit, defaulting to **dark** if unset.
- [ ] An inline pre-hydration script in `app/layout.tsx` sets `data-theme` before first paint to
      avoid a flash of wrong theme (FOUC). `suppressHydrationWarning` already present is retained.
- [ ] A theme toggle is exposed in `ERPShell` header using existing UI primitives only
      (no new primitive — per CLAUDE.md "check `components/ui/` first").

### Migration (inline literals → tokens)
- [ ] All ~2,313 hex literals and ~200 rgba literals in `style={{}}` objects are replaced with
      `var(--token)` references. Inline styles accept `var()`, so the inline-style architecture
      is retained — only the values change.
- [ ] Per-file local color maps (e.g. `statusConfig`) reference tokens, not literals.
- [ ] The shared primitives are migrated first as the highest-leverage targets:
      `ERPTable` (21 hex), `ERPTreeTable` (20), `ERPShell` (19), `SearchSelect` (7).
- [ ] After migration, `grep -rE "#[0-9a-fA-F]{6}|rgba\(" app components --include="*.tsx"`
      returns **0** results outside `lib/theme/` and `globals.css`.
- [ ] The 17 stray Tailwind color utilities (`text-white`, `bg-white`, `bg-black`,
      `border-white`) are replaced with token-backed equivalents.

### Light palette quality
- [ ] Light values are designed (not auto-inverted): backgrounds light, text dark, accent orange
      preserved as the single expressive color (per DESIGN-SYSTEM.md).
- [ ] All `rgba(255,255,255,0.0x)` overlay surfaces/borders have light-theme equivalents derived
      as `rgba(0,0,0,0.0x)` (or solid tokens) so subtle surfaces remain visible on light.
- [ ] Text/background pairs meet **WCAG AA** contrast (≥4.5:1 body, ≥3:1 large) in **both** themes.

### Non-regression (hard requirement)
- [ ] With theme = dark, every page is **pixel-identical** to the pre-refactor build. Dark is the
      reference; the refactor must not visibly change it.
- [ ] No new dependency is added to `package.json` (no `next-themes`, no state library).
- [ ] `pnpm build` and `pnpm lint` pass with no new errors.

---

## Out of scope

- **Backend changes** — none. This is frontend-only.
- **Redesign of any layout, spacing, typography, or component structure** — colors only.
- **Tremor chart re-theming beyond token wiring** — Tremor's own `--tremor-*` vars are left as-is;
  only verified if a Tremor chart visibly breaks in light mode.
- **Migrating off inline styles to Tailwind classes or CSS modules** — the inline-style
  architecture stays; we only swap literal values for `var(--token)`. A move to utility classes
  would be a separate spec.
- **Per-tenant / user-customizable themes, high-contrast mode, or more than two themes.**
- **Animations or transition between themes** beyond a basic CSS transition (optional polish).

---

## Data model changes

None. No Prisma schema changes, no database, no API. This spec touches only frontend styling.

---

## API contracts

None. No new or changed endpoints. The theme preference is persisted client-side in
`localStorage`, not on the server (a server-persisted user preference would be a future spec
requiring a backend `tenant-settings`/`users` change — explicitly out of scope here).

---

## Implementation notes

### Files involved
- `frontend/app/globals.css` — token declarations (dark + light), remove hardcoded `body` colors.
- `frontend/app/layout.tsx` — `data-theme` + pre-hydration FOUC script (replaces `className="dark"`).
- `frontend/lib/theme/tokens.ts` *(new)* — typed token name constants.
- `frontend/lib/theme/ThemeProvider.tsx` *(new)* — context + `localStorage` + `prefers-color-scheme`.
- `frontend/components/layout/ERPShell.tsx` — header toggle + migrate 19 hex.
- `frontend/components/ui/ERPTable.tsx` (21), `ERPTreeTable.tsx` (20), `SearchSelect.tsx` (7) — migrate.
- All remaining 55 `app/**` + `components/**` files containing literals (Appendix A is the worklist).
- `frontend/tailwind.config.ts` — keep `darkMode: "class"`/`data-theme` consistent; leave Tremor tokens.

### Recommended sequencing (within the spec, once unblocked)
1. **Phase 0 — Foundation** (~1–2 days): tokens + provider + toggle + FOUC script. Dark only;
   no visual change. Shippable on its own.
2. **Phase 1 — Semantic mapping** (~2–3 days): finalize Appendix A literal→token map. Human
   judgment required; not automatable.
3. **Phase 2 — Migration** (~4–6 days): primitives first, then pages. Mechanical once the map is
   fixed. Verify the `grep returns 0` criterion incrementally.
4. **Phase 3 — Light palette + QA** (~3–5 days): design light values, fix rgba overlays, AA
   contrast pass, page-by-page visual QA in both themes.

Realistic total: **~3–4 weeks**, one developer. A scoped "good enough" variant (foundation +
high-traffic pages only) is ~1–1.5 weeks but leaves two systems coexisting temporarily.

### Key risks (carried from the audit)
1. **Semantic ambiguity** — same hex, different roles; no 1:1 swap. Mapping is manual.
2. **rgba-on-dark overlays** — ~200 white-alpha values vanish on light; must be re-derived.
3. **Dead Tremor tokens** — look like theming infra but are unused; do not build on them blindly.
4. **No visual test net** — QA is manual per page; budget Phase 3 accordingly.

### Global infrastructure
- Reuse existing primitives only (`ERPShell`, `SearchSelect`, etc.) — do not create a new toggle
  primitive without checking `components/ui/` first (CLAUDE.md).
- Orange (`#ea580c` / `#fb923c`) remains the only expressive color in both themes (DESIGN-SYSTEM.md).
- No emojis introduced; dark-mode-only assumption in copy/docs updated to "dark default".

---

## Verification checklist

```bash
cd frontend

# 1. No literal colors remain outside the theme layer → expect 0
grep -rE "#[0-9a-fA-F]{6}|rgba\(" app components --include="*.tsx" | grep -vE "lib/theme/" | wc -l
# Expected: 0

# 2. No hardcoded dark class on <html> → expect 0 (replaced by data-theme)
grep -nE '<html[^>]*className="[^"]*dark' app/layout.tsx | wc -l
# Expected: 0

# 3. data-theme application present → expect ≥1
grep -rnE "data-theme" app/layout.tsx lib/theme | wc -l
# Expected: >= 1

# 4. No new dependency (no next-themes / state libs)
grep -E "next-themes|zustand|redux|jotai" package.json || echo "clean"
# Expected: clean

# 5. Tokens defined for both themes → expect both matches
grep -E "\[data-theme=\"light\"\]|\[data-theme=\"dark\"\]" app/globals.css | wc -l
# Expected: >= 2

# 6. Build + lint
pnpm build && pnpm lint
# Expected: build passes, no new lint errors

# 7. MANUAL: toggle theme in ERPShell header; reload → preference persists (localStorage)
# 8. MANUAL: dark theme visually unchanged vs. pre-refactor (pixel non-regression)
# 9. MANUAL: light theme — every page legible, AA contrast, no invisible rgba surfaces
```

---

## Appendix A — Color inventory (audit 2026-06-04)

Totals: **2,313 hex literal usages** · **59 distinct hex** · **~200 distinct rgba** ·
**4,554 inline color-style sites** · **59/80 files** affected · **0** CSS vars · **0** `dark:` classes.

### A.1 — Distinct hex by usage count → proposed semantic token

| Count | Hex | Role (observed) | Proposed token |
|------:|-----|-----------------|----------------|
| 297 | `#fb923c` | orange accent (light) | `--accent` |
| 289 | `#4ade80` | success / positive | `--success` |
| 247 | `#f87171` | danger / negative | `--danger` |
| 244 | `#e2dfd8` | primary text | `--text` |
| 189 | `#f1ede8` | strong/heading text | `--text-strong` |
| 182 | `#60a5fa` | info / blue | `--info` |
| 155 | `#fbbf24` | warning / amber | `--warning` |
| 120 | `#0e0b1a` | base background | `--bg-base` |
| 107 | `#fca5a5` | danger (light) | `--danger-muted` |
|  92 | `#a78bfa` | violet / special | `--violet` |
|  68 | `#f97316` | orange (mid) | `--accent` |
|  68 | `#c2410c` | orange (dark) | `--accent-strong` |
|  67 | `#ea580c` | orange (primary) | `--accent-strong` |
|  18 | `#0a0712` | deepest background | `--bg-base-deep` |
|  17 | `#6b7280` | neutral gray | `--text-subtle` |
|  12 | `#16a34a` | success (dark) | `--success-strong` |
|   8 | `#6d28d9` | violet (dark) | `--violet-strong` |
|   8 | `#3b82f6` | info (mid) | `--info` |
|   8 | `#1d4ed8` | info (dark) | `--info-strong` |
|   7 | `#7c3aed` | violet (mid) | `--violet` |
|   7 | `#34d399` | emerald | `--success` |
|   7 | `#22c55e` | success (mid) | `--success` |
|   7 | `#1e3a8a` | info (darkest) | `--info-strong` |
|   7 | `#15803d` | success (darkest) | `--success-strong` |
|   6 | `#4c1d95` | violet (darkest) | `--violet-strong` |
| … | (34 more distinct hex, long tail) | — | map during Phase 1 |

### A.2 — Top rgba (white-alpha overlays — the light-theme risk set)

| Count | rgba | Role | Light-theme derivation |
|------:|------|------|------------------------|
| 163 | `rgba(255,255,255,0.3)` | muted text | `var(--text-muted)` |
|  85 | `rgba(255,255,255,0.5)` | muted text | `var(--text-muted)` |
|  85 | `rgba(255,255,255,0.4)` | muted text | `var(--text-muted)` |
|  62 | `rgba(255,255,255,0.45)` | muted text | `var(--text-muted)` |
|  57 | `rgba(255,255,255,0.25)` | subtle text/border | `var(--text-subtle)` |
|  54 | `rgba(255,255,255,0.35)` | muted text | `var(--text-muted)` |
|  46 | `rgba(255,255,255,0.04)` | surface fill | `var(--bg-surface)` → black-alpha on light |
|  43 | `rgba(255,255,255,0.2)` | subtle border | `var(--border)` |
|  43 | `rgba(255,255,255,0.05)` | surface fill | `var(--bg-surface)` → black-alpha on light |
|  42 | `rgba(251,146,60,0.6)` | accent overlay | `var(--accent-muted)` |
| … | (~190 more distinct rgba) | — | map during Phase 1 |

> ⚠️ Every `rgba(255,255,255,0.0x)` above is **invisible on a light background**. These are not
> swaps — their light equivalents must be re-derived (black-alpha or solid surface tokens). This
> is the single largest QA risk and the reason Phase 3 is budgeted at 3–5 days.

### A.3 — Tailwind color utilities (residual, 17 total)
`text-white` ×12 · `bg-white` ×2 · `bg-black` ×2 · `border-white` ×1 → all map to tokens.

### A.4 — Primitive hotspots (migrate first)
`ERPTable.tsx` 21 hex · `ERPTreeTable.tsx` 20 · `ERPShell.tsx` 19 · `SearchSelect.tsx` 7 ·
`stat-card.tsx` 0 · `data-table.tsx` 0.

---

## Status log

| Date | Status | Note |
|------|--------|------|
| 2026-06-04 | Deferred | Spec authored from live audit. Blocked on Bloque 1 backend specs (see [`MODULE-CASCADE.md`](../MODULE-CASCADE.md)). No implementation started. |

---
name: frontend-component-builder
description: Build React components and pages for the Sunset ERP frontend following the project's exact conventions — inline style objects with hex literals (no Tailwind color classes), "use client", the ERPTable/ERPFilterBar/ERPShell/SearchSelect primitives, apiClient for data, local COLORS style maps, explicitly-sized SVG icons, no emojis. Use when the user wants a new frontend component, page, modal, table, filter bar, or form (e.g. "build a page for X", "add a component that Y").
---

# Frontend Component Builder

Build React components for `frontend/` that are indistinguishable from the existing
codebase. The output must read like it was written by whoever wrote `ERPTable.tsx` —
same idioms, same styling approach, same data flow. This skill encodes the rules;
when in doubt, open a neighboring component and copy its shape.

## Step 0 — read before writing

1. **`DESIGN-SYSTEM.md`** (repo root) — authoritative for EVERY visual decision
   (colors, spacing, typography, states). Read it before choosing any hex value,
   radius, or font size. If the design system and this skill disagree, the design
   system wins.
2. **The nearest existing analog** — building a list page? Read an existing one
   (e.g. `app/inventory/items/page.tsx`). A modal? Read how `components/ui/dialog.tsx`
   is composed. Match its structure, not your habits.
3. **`frontend/package.json`** — before importing ANY library, confirm it is already a
   dependency. **Never add a new npm dependency**; if a need seems to require one,
   stop and tell the user what is missing and why, instead of installing it.

## Hard rules (each one is a review-blocker)

### Styling
- **Inline `style={{}}` objects with hex literals.** NO Tailwind color classes
  (`bg-orange-500`, `text-zinc-400` are forbidden). Layout-only Tailwind utilities that
  already appear in the file you are matching are acceptable; colors never are.
- **Group every color in a local style map** at the top of the file so a future token
  swap (spec-frontend-001-theming) is mechanical:
  ```tsx
  const COLORS = {
    accent:     '#fb923c',   // orange-400 — the ONLY expressive color
    accentDeep: '#ea580c',   // orange-600
    bg:         '#09090b',
    surface:    '#18181b',
    border:     '#27272a',
    text:       '#fafafa',
    textMuted:  '#a1a1aa',
  };
  // usage: style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}` }}
  ```
  Never scatter raw hex literals through JSX — every hex appears exactly once, in the map.
- **Dark mode only.** No light-mode variants, no `prefers-color-scheme`, no theme toggles.
- **Orange (`#ea580c` / `#fb923c`) is the only expressive color.** Everything else is
  the zinc/neutral ramp. Status colors (success/error/warning) only as defined in
  `DESIGN-SYSTEM.md`.

### Component mechanics
- **`"use client"`** as the first line of every interactive component (anything with
  hooks, handlers, or browser APIs). Server components are the exception in this
  codebase, not the rule.
- **No emojis anywhere** — not in JSX, not in labels, not in placeholder text.
- **Icons are explicitly-sized inline SVG**: `width`/`height` in px attributes AND
  `flexShrink: 0` (or `flex-shrink: 0`) so they never collapse or balloon. No icon
  fonts, no emoji glyphs, no unsized SVG.
- **UI language: English only.**

### Use the existing primitives — never rebuild them
Check these before creating anything; creating a parallel primitive is a defect:

| Need | Use | Lives at |
|---|---|---|
| Page chrome (sidebar + header) | `ERPShell` — **every page** is wrapped in it, no exceptions | `components/layout/ERPShell.tsx` |
| Data table (sort, paginate, search) | `ERPTable` | `components/ui/ERPTable.tsx` |
| Hierarchical table | `ERPTreeTable` | `components/ui/ERPTreeTable.tsx` |
| Filter bar | `ERPFilterBar` + `useERPFilters` + `applyERPFilters` | `components/ui/ERPFilterBar.tsx` |
| Any dropdown/select input | `SearchSelect` | `components/ui/SearchSelect.tsx` |
| Any date input | `ERPDatePicker` | `components/ui/ERPDatePicker.tsx` |
| Metric/KPI card | `stat-card` | `components/ui/stat-card.tsx` |
| Buttons, inputs, dialogs, badges | the shadcn-style primitives | `components/ui/*.tsx` |

If a genuinely new primitive is required, say so explicitly in your summary and put it
in `components/ui/` following the local naming style — after confirming nothing in
`components/ui/` already covers it.

### Data fetching — the established pattern (do not modernize it)
```
lib/api/<resource>.ts   → typed API module (getAll/getById/create/update/remove)
lib/api/client.ts       → apiClient (axios; injects JWT, handles 401 redirect)
lib/api/types.ts        → shared DTOs/entities/enums
page.tsx                → "use client" + useEffect + useState
```
- ALL HTTP goes through `apiClient` from `lib/api/client.ts`. Never `fetch`, never a
  second axios instance.
- **Do not introduce react-query, redux, or zustand** for data fetching. They are
  installed but deliberately unused — the migration needs its own approved spec.
- List endpoints return envelopes (`{ <resource>: [...], count }`) on specced modules —
  check the backend module's spec (or the API module in `lib/api/`) for the actual
  shape rather than assuming a bare array. New API modules unwrap the envelope inside
  the getter so pages receive plain arrays.
- Handle loading and error states the way the neighboring page does (typically
  `loading` / `error` useState + early-return or inline banner).

## Procedure

1. Read `DESIGN-SYSTEM.md`, the nearest analog component/page, and `package.json`.
2. Sketch the component contract: props, state, API calls, which primitives compose it.
3. Write the component obeying every hard rule above. 2-space indent, section divider
   comments (`// ── … ──`) where the file you are matching uses them.
4. Self-check against the checklist below, then `cd frontend && pnpm build` (and
   `pnpm lint` for the touched files) before declaring done.

## Self-check (run through this before finishing)

- [ ] `"use client"` present if interactive
- [ ] Zero Tailwind color classes; every color via the local `COLORS` map
- [ ] Wrapped in `ERPShell` if it is a page
- [ ] No primitive rebuilt that `components/ui/` already provides
- [ ] All HTTP via `apiClient`; no new state-management library
- [ ] No new npm dependency; imports all resolve against `package.json`
- [ ] No emojis; SVGs have explicit `width`/`height` + `flexShrink: 0`
- [ ] English-only UI strings
- [ ] `pnpm build` passes

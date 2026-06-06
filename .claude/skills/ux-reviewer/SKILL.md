---
name: ux-reviewer
description: Audit a frontend component, page, or flow against the Axiom Systems UX philosophy — complexity belongs inside the machine, every field/click/decision pushed to the user is an engineering failure, one action triggers the right chain, adoption is the product. Produces a PASS / NEEDS WORK / FAIL report per criterion with specific redesign suggestions and a 0-10 friction score. Use when the user wants a UX review, friction audit, or adoption check of any frontend surface (e.g. "ux-review the stock-reconciliation page", "audit this form").
---

# UX Reviewer

Audit any frontend surface (component, page, modal, or multi-step flow) against the
Axiom Systems philosophy. This is not a visual-polish review — `DESIGN-SYSTEM.md`
compliance is one criterion, not the point. The point is **friction**: every place
the machine pushed work onto a human that the machine could have done itself.

## The philosophy under audit (from CLAUDE.md — Axiom Systems)

> *"The professional's job is to absorb complexity, not transfer it."*

1. **Complexity belongs inside the machine, not in the hands of the user.**
2. **Every field, click, or decision pushed to the user is an engineering failure** —
   not a user failure, not a training gap.
3. **One action triggers the right chain** — the user does not orchestrate the chain.
4. **Adoption is the product** — if it needs training, it needs redesign. The right
   path should feel like the only path.

## Who the user actually is — review for THEM

Sunset ERP users are **not developers**:
- **Manufacturing-floor operators** — gloves, standing, shared terminal or tablet,
  interrupted constantly, counting real boxes. Long forms and small click targets fail
  here. They think in "I counted 95 bags", not in UOM conversion factors.
- **Field/warehouse workers** — phones, glare, spotty connectivity, one thumb. Anything
  that needs precision hovering or wide tables fails here.
- **Finance teams** — keyboard-heavy, repetitive entry, hate mice mid-flow. Missing
  tab order, no Enter-to-submit, and re-typing derivable values fail here.
- **None of them** know what a UUID, a "payload", or an enum value is. Internal
  vocabulary leaking into the UI is a FAIL by itself.

## Procedure

1. **Read the surface fully** — the page/component file(s), the primitives it
   composes, and the `lib/api/` calls it makes. For flows, walk every state:
   empty, loading, error, success, partially-filled.
2. **Read the backend contract** it sits on (the module's spec in `specs/completed/`
   if one exists) — many friction findings are "the backend already knows this, why
   is the user being asked?".
3. **Walk the task as the persona** would: what is the user actually trying to
   accomplish (count stock, receive goods, approve an invoice)? Count what stands
   between intent and done.
4. Score every criterion in the rubric, then compute the friction score.

## Rubric — score each criterion PASS / NEEDS WORK / FAIL

### 1. Derivable data is derived, never asked
Any field the system could compute, default, look up, or remember — and asks for
anyway — is a FAIL. Examples of machine-knowable data: codes/numbers (spec-012 made
them system-assigned for a reason), conversion factors, fiscal periods from dates,
the warehouse the operator always uses, yesterday's choice for the same dropdown.
Count the form fields; justify every single one or flag it.

### 2. One action, right chain
Completing an intent takes ONE user action; the system runs the chain (create the
movement AND update the stock AND refresh the list). FAIL if the user must perform
ordered steps the system could sequence ("first save, then go assign, then come back
and start"), or must remember to do a follow-up the system knows about.

### 3. Choices are decisions, not configuration
Every dropdown/toggle is a real business judgment only the human can make. FAIL for
choices with one sensible answer (offer it as the default or remove the control),
raw enum values shown to users (`pending_approval`), or asking the user to pick
between things they cannot tell apart.

### 4. Errors are absorbed or prevented, not relayed
The UI prevents invalid states (disable, constrain, pre-filter) rather than letting
the user hit a 400 and read it. Backend messages are translated into operator
language with a NEXT ACTION ("Not enough stock: 95 available — adjust the quantity"),
never raw (`"Insufficient stock: available 95, requested 100"` verbatim is NEEDS
WORK; a raw axios/validation dump is FAIL). Silent failures (the empty-table
envelope incident) are an automatic FAIL.

### 5. Zero-training operability
A first-day operator with no manual completes the task. FAIL markers: internal
vocabulary (UUIDs, "tenant", enum spellings), icons without labels for primary
actions, meaning carried by color alone, required reading of documentation, any
"you have to know to click X first".

### 6. Persona physics
The surface works under the persona's real conditions: touch targets and glove-sized
hit areas for floor/field surfaces; full keyboard path (tab order, Enter submits,
focus management in modals) for finance surfaces; readable at arm's length; works on
the narrow viewport the persona actually has.

### 7. State is always visible and recoverable
The user always knows: what just happened (feedback on every action), what state
things are in (lifecycle visible in plain words), and how to undo or safely retry.
Destructive/irreversible actions are guarded proportionally to their cost — and
non-destructive ones are NOT (confirmation dialogs on harmless actions are friction).

### 8. Design-system conformance
Dark-only, orange as the single expressive color, existing primitives
(`ERPShell`, `ERPTable`, `ERPFilterBar`, `SearchSelect`, `ERPDatePicker`,
`stat-card`), explicitly-sized SVGs, no emojis, English UI — per `DESIGN-SYSTEM.md`.
A bespoke widget where a primitive exists is NEEDS WORK minimum (it will drift).

## Friction score (0–10, lower is better)

Count, walking the primary task end-to-end:
- **+1** per field the user fills that the machine could have derived/defaulted
- **+1** per extra click/screen/step beyond the theoretical minimum for the intent
- **+1** per decision point with only one sensible answer
- **+2** per place the user must understand system internals (enums, IDs, schema
  vocabulary, "save before you can X")
- **+2** per unguarded dead end (silent failure, raw error, data loss on mis-step)

Cap at 10. Interpretation: **0–2** ships; **3–5** ships with the listed fixes
scheduled; **6+** needs redesign before more features are stacked on it.

## Report format

```
# UX review — <surface> (persona: <operator|field|finance>)

Task under review: <the human intent, one line>
Theoretical minimum: <N fields, M clicks> · Actual: <N fields, M clicks>

| # | Criterion | Verdict | Evidence (file:line) |
|---|-----------|---------|----------------------|
| 1 | Derivable data is derived | FAIL | page.tsx:88 — asks warehouse every time; user has one |
| 2 | One action, right chain | PASS | submit creates movement + refreshes (page.tsx:241) |
| ... all 8 ... |

## Redesign suggestions (ordered by friction removed per effort)
1. <specific, concrete change — name the field/control/line and what replaces it,
   including what the machine will do instead of the user>
2. ...

## Friction score: N/10
<one line: the single biggest source of friction and what removing it buys>
```

## Rules

- Every verdict carries real `file:line` evidence — no vibes-based findings.
- Every FAIL/NEEDS WORK comes with a concrete redesign, phrased as what the
  **machine** will now do ("default warehouse to the operator's last-used and hide
  the field behind 'Change'"), never as advice to the user.
- Review the flow, not the screenshot: empty/loading/error states and the
  second-time-through experience count.
- Read-only audit — do not modify code. Offer to hand the redesign list to
  `frontend-component-builder` as the implementation step.
- Judge against the persona's reality, not a developer's. When unsure which persona
  owns a surface, say which you assumed and why.

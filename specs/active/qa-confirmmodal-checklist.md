# QA checklist — ConfirmModal destructive-action guards (spec-frontend-003 P2–P4)

Manual browser walkthrough for the 11 pages where unguarded destructive actions
were migrated to the shared `ConfirmModal`. Covers all 17 destructive actions from
the 2026-06-06 audit. Commits `9d58966..1182ea0`; spec status log entry 2026-06-20.

## How to run

- App: `http://localhost:3001` · Login: `admin@demo.com` / `Admin123!` (tenant `DEMO`)
- Backend `:3000` and frontend `:3001` must be up.
- **The core assertion for every row:** the destructive button opens the **dark themed
  modal** — never a native browser `confirm()`/`alert()` popup.
- For each modal check: correct **title/description**, destructive actions are **red**
  (destructive variant), **Cancel/Keep dismisses without acting**, **Confirm performs
  the action**, and on a server error the message **surfaces inline in the modal** (the
  modal stays open) — no `alert`, no page crash.
- Keep the browser **console + network** panels open; note any new `TypeError`,
  unhandled rejection, or 4xx/5xx.
- Verdicts: **PASS** (confirmed, no console/network errors) · **WARNING** (works, minor
  anomaly) · **FAIL** (wrong behavior/crash/native popup) · **UNVERIFIABLE** (state why).
- Do not test on records you care about — voids/cancels/deletes are real.

---

## Checklist

### 1. /sales/sales-orders
- [ ] Expand a `confirmed` order → **Ship** → modal "Ship Order &lt;SO#&gt;?" mentions
      outbound stock movements; variant **destructive**.
- [ ] **Keep / Cancel** dismisses, order stays `confirmed`.
- [ ] **Ship Order** confirms → status → `shipped`, no console/network error.
- [ ] On a `shipped` order → **Deliver** → modal "Mark Delivered &lt;SO#&gt;?".
- [ ] Confirm → status → `delivered`.
- [ ] **Confirm** (draft→confirmed) and **Close** (delivered→closed) stay **direct**
      (no modal — by design).

### 2. /sales/invoices
- [ ] `draft` invoice → **Send** → modal "Send invoice &lt;INV#&gt;?" (variant **default**).
- [ ] Confirm → status → `sent`.
- [ ] `sent`/`partial` invoice → **Void** → modal "Void invoice &lt;INV#&gt;?" (variant
      **destructive**).
- [ ] Cancel dismisses; Confirm voids → status → `void`.
- [ ] **+ Payment** still opens the PaymentModal (unchanged, not a ConfirmModal).

### 3. /manufacturing/production-plans
- [ ] Open a plan → **Cancel Plan** → modal "Cancel plan &lt;PLAN#&gt;?" (destructive),
      buttons **Cancel Plan / Keep Plan**.
- [ ] Confirm → status → `cancelled`.
- [ ] Forward actions (**Confirm Plan**, **Mark Completed**) stay direct.
- [ ] **Generate from SO** success now shows a **green in-page notice banner** (no
      `alert`, no emoji); errors show in the red banner.

### 4. /procurement/rfqs
- [ ] Open RFQ → **Send to Suppliers** → modal (variant **default**); button label
      has **no emoji**.
- [ ] Confirm → RFQ sent.
- [ ] Open a sendable RFQ → **Cancel RFQ** → modal (destructive), **Cancel RFQ / Keep RFQ**.
- [ ] Both: error from server surfaces **inline in the modal**, not a native `alert`.

### 5. /settings/roles
- [ ] **Delete** a role → modal `Delete role "&lt;name&gt;"?` (destructive) — **not**
      `window.confirm`.
- [ ] Cancel dismisses; Confirm removes the role from the grid.
- [ ] Try deleting a role that's in use → error surfaces inline in the modal.

### 6. /manufacturing/bom
- [ ] Table row **Delete** → modal "Delete BOM &lt;bomNumber&gt;?" (destructive) — was a
      **zero-guard** direct call.
- [ ] Cancel dismisses; Confirm removes the BOM row.
- [ ] Open a BOM → **Routing** tab → **Del** a step → modal "Delete routing step &lt;n&gt;?".
- [ ] Confirm removes the step; list refreshes.

### 7. /procurement/general-needs
- [ ] Open a GN → **Cancel GN** → modal "Cancel general need &lt;GN#&gt;?" (destructive),
      **Cancel GN / Keep GN**.
- [ ] Confirm → status → `cancelled`.
- [ ] Forward actions (**Mark In Progress**, **Mark Completed**) stay direct, but any
      status **error now shows in an inline red banner** (not `alert`).

### 8. /accounting/budgets
- [ ] `draft` budget **with lines** → **Approve** → modal "Approve budget &lt;code&gt;?"
      (notes the budget locks; variant **default**).
- [ ] Cancel dismisses (budget stays `draft`); Confirm → status → `approved`.
- [ ] Approve button stays disabled when the budget has 0 lines.

### 9. /accounting/fiscal-periods
- [ ] `open` period → **Close** → modal "Close fiscal period &lt;code&gt;?" (default).
- [ ] `closed` period → **Reopen** (default) and **Lock** (variant **destructive**).
- [ ] `locked` period → **Unlock** (default).
- [ ] Each shows action-specific copy; Cancel dismisses; Confirm applies; errors inline.
- [ ] **Delete** still uses the existing bespoke red dialog (left as-is, by design).

### 10. /settings/tenants
- [ ] Select a tenant → in its users list, **Remove** a user → modal
      "Remove &lt;fullName&gt; from this tenant?" (destructive) — was a **swallowed**
      direct delete.
- [ ] Cancel dismisses; Confirm removes the user from the tenant.
- [ ] **Set Default / Unset Default** stays direct (reversible — no modal, by design).

### 11. /settings/users
- [ ] Active user → **Disable** → modal "Disable &lt;fullName&gt;?" (destructive).
- [ ] Cancel dismisses (user stays active); Confirm → status → `Inactive`.
- [ ] Inactive user → **Enable** stays **direct** (restorative — no modal, by design).

---

## Result log

| # | Page | Verdict | Notes (console/network, anomalies) |
|---|---|---|---|
| 1 | sales/sales-orders | | |
| 2 | sales/invoices | | |
| 3 | manufacturing/production-plans | | |
| 4 | procurement/rfqs | | |
| 5 | settings/roles | | |
| 6 | manufacturing/bom | | |
| 7 | procurement/general-needs | | |
| 8 | accounting/budgets | | |
| 9 | accounting/fiscal-periods | | |
| 10 | settings/tenants | | |
| 11 | settings/users | | |

## Cross-cutting (note once)

- [ ] No native browser `confirm()`/`alert()` popups appeared anywhere.
- [ ] No new console errors vs. the login baseline.
- [ ] No 4xx/5xx beyond the deliberate error-path tests.
- [ ] No mid-session bounce to `/login` (token handling).
- [ ] PrintButton still works on sales-orders / invoices / rfqs (row print icon).

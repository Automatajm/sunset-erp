# spec-022 — Notifications Infrastructure

Status: **Draft**
Owner: Axiom Systems
Sprint: planned infrastructure (implement AFTER invoices — triggers need those modules)
Module(s): notifications (new), tenant-settings; event hooks in sales-orders, purchase-orders, rfqs, ar-invoices/ap-invoices, stock-transactions
Last updated: 2026-06-06

## Problem

Nothing in Sunset ERP communicates outward. A confirmed sales order, a generated PO,
a sent RFQ, an overdue invoice, or stock falling below its reorder point
(`Item.reorderPoint`, `schema.prisma:734`) all die silently inside the database —
the business finds out by logging in and looking. There is no `Notification` model,
no mail dependency in `backend/package.json`, and no per-tenant email configuration.

Per the Axiom philosophy, the system must carry the chain: one business event triggers
the right outbound message with zero user action. This spec defines the queue-first
notification infrastructure every module will emit into.

## Acceptance criteria

### Data model
- [ ] `Notification` model: `id`, `tenantId`, `type` (event key, e.g.
      `'so_confirmed'`), `channel` (`'email' | 'in_app'`), `status`
      (`'pending' | 'sent' | 'failed' | 'cancelled'`), `recipientEmail`,
      `recipientName`, `subject`, `body`, `payload` (Json — the triggering entity
      snapshot), `retryCount Int @default(0)`, `sentAt DateTime?`, `createdBy`,
      audit columns; indexed `[tenantId, status]` (queue scan).
- [ ] `TenantSettings` gains email provider config: `emailProvider`
      (`'smtp' | 'sendgrid' | 'resend'`), `emailHost`, `emailPort`, `emailApiKey`
      (encrypted at rest or env-referenced — never returned by any endpoint),
      `emailFromAddress`, `emailFromName`.

### NotificationService (new module)
- [ ] `queue(tenantId, type, recipient, payload)` — renders the template, inserts a
      `pending` row, returns immediately. **Never sends inline — the API response
      must never block on SMTP.**
- [ ] Background job (cron/interval worker) drains `pending` rows per tenant using
      that tenant's provider config; success → `sent` + `sentAt`; failure →
      `retryCount++`, exponential backoff, → `failed` after 3 attempts.
- [ ] `retry(id)` and `cancel(id)` endpoints for `failed`/`pending` rows,
      tenant-scoped writes (`updateMany({ where: { id, tenantId } })`).
- [ ] All queries tenant-scoped; list endpoint `{ notifications, count }` with
      query DTO (`status`/`type`/`channel` `@IsIn` whitelists).

### Template system
- [ ] Each notification `type` has a subject + body template with `{{variable}}`
      substitution from `payload` (e.g. `{{soNumber}}`, `{{customerName}}`,
      `{{total}}`); unknown variables render empty + log a warning, never crash.
- [ ] Templates seeded per type; English UI language (per DESIGN-SYSTEM).

### Event triggers (emitted by owning modules, one line each)
- [ ] SO confirmed → email to the customer contact.
- [ ] PO generated (incl. RFQ award auto-generation) → email to the supplier.
- [ ] RFQ sent → email to every invited supplier.
- [ ] Invoice overdue → email to the configured stakeholder.
- [ ] Stock below `reorderPoint` (on stock movement commit) → email to the
      purchasing manager.
- [ ] Triggers are fire-and-forget `queue()` calls — a notification failure NEVER
      rolls back or fails the business transaction.

## Out of scope

- SMS / WhatsApp / push channels (`channel` is extensible by design).
- A frontend notification center page (in_app rows are modeled; the page is a
  frontend spec).
- Per-user notification preferences/subscriptions.
- Building the invoice-overdue scheduler before ar-invoices/ap-invoices ship.

## Data model

| Model | Table | Key fields |
|---|---|---|
| `Notification` (new) | `ntf_notifications` | type, channel, status, recipient*, subject, body, payload Json, retryCount, sentAt |
| `TenantSettings` (modified) | `cfg_tenant_settings` | + emailProvider/Host/Port/ApiKey/FromAddress/FromName |

Invariants: queue-first (no inline send); `emailApiKey` never serialized; status
machine `pending → sent | failed | cancelled`, `failed → pending` (retry).

## API contracts

### GET /api/notifications?status=failed
```json
// 200 → { "notifications": [...], "count": n }   // payload included, apiKey never
```

### POST /api/notifications/:id/retry · POST /api/notifications/:id/cancel
```json
// 200 → { "message": "...", "notification": {...} }
// Errors: 404 wrong tenant/id, 400 illegal status transition
```

### NotificationService (internal)
```ts
queue(tenantId: string, type: NotificationType, recipient: { email: string; name?: string },
      payload: Record<string, unknown>): Promise<void>  // returns before any send
```

## Implementation notes

| File | Change |
|---|---|
| `prisma/schema.prisma` | Notification model; TenantSettings provider fields |
| `src/modules/notifications/*` | Service (queue/send/retry), worker, controller, DTOs, templates |
| emitting services | one `queue()` call at each trigger point (after commit) |
| `package.json` | mail transport dep (nodemailer or provider SDK) — **new dependency, ask first** |

**This spec is DRAFT — implement after invoices are complete so all five event
triggers have their emitting modules in place.** New npm dependency requires explicit
approval per CLAUDE.md.

## Verification checklist

```bash
# 1. Confirm an SO → notification row appears as 'pending' (API responded already)
# 2. Worker tick → row becomes 'sent' with sentAt (mock/SMTP sandbox)
# 3. Break provider config → 3 retries with backoff → 'failed'; POST retry → re-queued
# 4. GET /api/notifications never includes emailApiKey
# 5. Tenant B cannot see/retry tenant A's notifications (404)
# 6. Template renders {{soNumber}}; unknown {{var}} → empty + warning, no crash
# 7. Kill the worker → business flows (SO confirm, PO create) still succeed
```

## Status log

| Date | Action | Result |
|---|---|---|
| 2026-06-06 | Spec drafted (planned infrastructure; no Notification model, no mail dep, no provider config exist today) | Draft — implement after invoices ship |

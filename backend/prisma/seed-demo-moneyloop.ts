// ============================================================================
// FILE: backend/prisma/seed-demo-moneyloop.ts
// Money-loop enrichment for the Burger Borinquen demo (BURGER tenant).
//
// WHY API-DRIVEN (not a Prisma-direct seed): GRN, AP/AR invoices, payments and
// MO delivery must run through the real services so JEs balance, stock + WAC move
// correctly, exchange rates freeze (spec-021/025/026) and notification triggers
// fire (spec-022). Hand-replicating that in a Prisma seed would be fragile.
//
// Prereqs: backend running, base seed loaded (`pnpm seed`). The base seed now
// sets POs 'confirmed' and seeds the GL accounts the posting engine resolves by
// code (1.1.02/03/04/05, 5.2.01, 6.2.07); this script also ensures them so it
// works against older DBs. Each flow is self-healing / re-runnable.
//
// Run:  npx ts-node prisma/seed-demo-moneyloop.ts
// ============================================================================

const BASE = process.env.API_BASE ?? 'http://localhost:3000/api';
const EMAIL = process.env.DEMO_EMAIL ?? 'admin@burger.do';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'Admin123!';

let token = '';

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
const list = (d: any, key: string): any[] => (Array.isArray(d) ? d : (d?.[key] ?? []));
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const warn = (m: string, r: { status: number; data: any }) =>
  console.warn(`  ${m} → ${r.status} ${JSON.stringify(r.data).slice(0, 110)}`);

async function main() {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = login.data?.access_token;
  if (!token) throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.data)}`);
  console.log(`🔑 Logged in as ${EMAIL}`);

  // ── Step 0 — ensure GL accounts + contact data the money loop needs ───────
  const REQUIRED_ACCOUNTS = [
    { accountNumber: '1.1.02', name: 'Banco Operativo', accountType: 'asset' },
    { accountNumber: '1.1.03', name: 'Cuentas por Cobrar', accountType: 'asset' },
    { accountNumber: '1.1.04', name: 'Inventario Materia Prima', accountType: 'asset' },
    { accountNumber: '1.1.05', name: 'Inventario Producto Terminado', accountType: 'asset' },
    { accountNumber: '5.2.01', name: 'Variación de Precio de Compra', accountType: 'expense' },
    { accountNumber: '6.2.07', name: 'Pérdidas de Producción (Merma)', accountType: 'expense' },
  ];
  const existingAcct = new Set(
    list((await api('GET', '/chart-of-accounts')).data, 'accounts').map((a: any) => a.accountNumber),
  );
  let acctAdded = 0;
  for (const a of REQUIRED_ACCOUNTS) {
    if (existingAcct.has(a.accountNumber)) continue;
    const r = await api('POST', '/chart-of-accounts', a);
    if (r.status === 201) acctAdded++;
    else if (r.status !== 409) warn(`acct ${a.accountNumber}`, r);
  }
  await api('PATCH', '/tenant-settings', {
    emailFromAddress: 'operaciones@burgerborinquen.demo',
    emailFromName: 'Burger Borinquen — Operaciones',
  });
  const allCustomers = list((await api('GET', '/customers')).data, 'customers');
  let emailBackfill = 0;
  for (const c of allCustomers) {
    if (c.email) continue;
    const slug = String(c.code ?? c.id).toLowerCase().replace(/[^a-z0-9]/g, '');
    if ((await api('PATCH', `/customers/${c.id}`, { email: `${slug}@cliente.demo` })).status === 200) emailBackfill++;
  }
  console.log(`✉️  Setup: ${acctAdded} GL accounts added, ops inbox set, ${emailBackfill} customer emails backfilled`);

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const wh = list((await api('GET', '/warehouses')).data, 'warehouses')[0];
  const warehouseId: string = wh.id;
  const pos = list((await api('GET', '/purchase-orders?status=confirmed')).data, 'purchaseOrders');
  const boms = list((await api('GET', '/bom')).data, 'boms');
  const monthEnd = (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + 1, 0); })();
  const sos = list((await api('GET', '/sales-orders')).data, 'salesOrders').filter(
    (s: any) => s.status === 'confirmed' && new Date(s.orderDate) <= monthEnd,
  );
  console.log(`📦 Fixtures: warehouse ${wh.code}, ${pos.length} confirmed POs, ${sos.length} invoiceable SOs (≤ month-end), ${boms.length} BOMs`);

  const sum = { grn: 0, apPosted: 0, apPaid: 0, mo: 0, ar: 0, arPaid: 0 };

  // ── 1. GRN receipts (first 8 POs) — skip if any GRN already exists ────────
  if (list((await api('GET', '/goods-receipts')).data, 'goodsReceipts').length === 0) {
    for (const po of pos.slice(0, 8)) {
      const det = (await api('GET', `/purchase-orders/${po.id}`)).data;
      const lines = (det.lines ?? []).map((l: any) => ({
        poLineId: l.id, itemId: l.itemId, receivedQuantity: Number(l.orderedQuantity), uom: l.uom, unitCost: Number(l.unitPrice),
      }));
      if (!lines.length) continue;
      const r = await api('POST', '/goods-receipts', { poId: po.id, warehouseId, receivedDate: isoDaysAgo(20), condition: 'complete', lines });
      if (r.status === 201) sum.grn++; else warn(`GRN ${po.poNumber}`, r);
    }
  } else console.log('  GRN flow: already populated — skipping create');
  console.log(`🚚 GRNs posted this run: ${sum.grn}`);

  // ── 2. AP invoices (POs 8..18) — create-if-absent, then post drafts + pay ─
  let apInvs = list((await api('GET', '/ap-invoices')).data, 'apInvoices');
  if (apInvs.length === 0) {
    for (const po of pos.slice(8, 18)) {
      const r = await api('POST', `/ap-invoices/from-po/${po.id}`);
      if (r.status !== 201) warn(`AP from ${po.poNumber}`, r);
    }
    apInvs = list((await api('GET', '/ap-invoices')).data, 'apInvoices');
  }
  let apIdx = 0;
  for (const inv of apInvs) {
    let status = inv.status;
    if (status === 'draft') {
      const p = await api('PATCH', `/ap-invoices/${inv.id}/post`);
      if (p.status === 200) { sum.apPosted++; status = 'posted'; } else { warn(`AP post ${inv.invoiceNumber}`, p); continue; }
    }
    if (status === 'posted' && Number(inv.paidAmount) === 0) {
      const total = Number(inv.totalAmount); const mode = apIdx % 3;
      if (mode === 0) { if ((await api('POST', `/ap-invoices/${inv.id}/payments`, { paymentDate: isoDaysAgo(8), amount: total, paymentMethod: 'transfer' })).status === 201) sum.apPaid++; }
      else if (mode === 1) await api('POST', `/ap-invoices/${inv.id}/payments`, { paymentDate: isoDaysAgo(8), amount: Math.round(total * 0.5 * 100) / 100, paymentMethod: 'transfer' });
    }
    apIdx++;
  }
  console.log(`🧾 AP invoices: ${sum.apPosted} posted this run, ${sum.apPaid} fully paid`);

  // ── 3. Production orders — one per BOM, full lifecycle (skip if present) ──
  if (list((await api('GET', '/production-orders')).data, 'productionOrders').length === 0) {
    for (const bom of boms) {
      const r = await api('POST', '/production-orders', { bomId: bom.id, quantityOrdered: 200, plannedStartDate: isoDaysAgo(15), plannedEndDate: isoDaysAgo(12), priority: 'high' });
      if (r.status !== 201) { warn(`MO BOM ${bom.id}`, r); continue; }
      const mo = r.data; sum.mo++;
      await api('PATCH', `/production-orders/${mo.id}/status/released`);
      await api('PATCH', `/production-orders/${mo.id}/status/in_progress`);
      await api('POST', `/production-orders/${mo.id}/labor-actuals`, { workDate: isoDaysAgo(13), hoursPlanned: 8, hoursActual: 8.5, laborRate: 180 });
      await api('POST', `/production-orders/${mo.id}/deliver`, { quantityDelivered: 195, unitCost: 80, warehouseId }); // under-deliver → merma variance
    }
  } else console.log('  MO flow: already populated — skipping');
  console.log(`🏭 Production orders this run: ${sum.mo}`);

  // ── 4. AR invoices from past-dated SOs (first 16) — send + pay pattern ────
  if (list((await api('GET', '/ar-invoices')).data, 'arInvoices').length === 0) {
    const arSos = sos.slice(0, 16);
    for (let i = 0; i < arSos.length; i++) {
      const so = arSos[i];
      const c = await api('POST', `/ar-invoices/from-so/${so.id}`);
      if (c.status !== 201) { warn(`AR from ${so.soNumber}`, c); continue; }
      const inv = c.data; sum.ar++;
      const sent = await api('PATCH', `/ar-invoices/${inv.id}/send`);
      if (sent.status !== 200) { warn(`AR send ${inv.invoiceNumber}`, sent); continue; }
      const total = Number(inv.totalAmount); const mode = i % 3;
      if (mode === 0) { if ((await api('POST', `/ar-invoices/${inv.id}/payments`, { paymentDate: isoDaysAgo(3), amount: total, paymentMethod: 'transfer' })).status === 201) sum.arPaid++; }
      else if (mode === 1) await api('POST', `/ar-invoices/${inv.id}/payments`, { paymentDate: isoDaysAgo(3), amount: Math.round(total * 0.4 * 100) / 100, paymentMethod: 'transfer' });
      // mode 2 → left open; many are past-due (orderDate-based) → overdue scan picks them up
    }
  } else console.log('  AR flow: already populated — skipping');
  console.log(`💵 AR invoices: ${sum.ar} sent this run, ${sum.arPaid} fully collected`);

  // ── 5. Notifications — real triggers + overdue scan + drain ───────────────
  const custWithEmail = list((await api('GET', '/customers')).data, 'customers').find((c: any) => c.email);
  const fgItem = list((await api('GET', '/items')).data, 'items').find((x: any) => String(x.code).startsWith('FG-'));
  let triggered = 0;
  if (custWithEmail && fgItem) {
    for (let k = 0; k < 3; k++) {
      const so = await api('POST', '/sales-orders', { customerId: custWithEmail.id, lines: [{ itemId: fgItem.id, orderedQuantity: 50 + k * 10, uom: fgItem.baseUom ?? 'UNIT', unitPrice: 135 }] });
      if (so.status === 201 && (await api('PATCH', `/sales-orders/${so.data.id}/status/confirmed`)).status === 200) triggered++;
    }
  }
  const scan = await api('POST', '/ar-invoices/scan-overdue');
  const drain = await api('POST', '/notifications/drain');
  const notif = list((await api('GET', '/notifications')).data, 'notifications');
  console.log(`🔔 Notifications: ${triggered} so_confirmed triggered, ${scan.data?.queued ?? 0} overdue queued, drained=${JSON.stringify(drain.data)}, total=${notif.length}`);

  console.log('\n✅ Money-loop enrichment complete:', JSON.stringify(sum));
}

main().catch((e) => { console.error('❌ Enrichment failed:', e?.message ?? e); process.exit(1); });

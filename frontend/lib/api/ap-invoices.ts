// ============================================================================
// FILE: frontend/lib/api/ap-invoices.ts
// ============================================================================
import apiClient from './client';

function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}

export interface MatchLine {
  lineNumber: number; itemCode: string; itemName: string;
  invoiceQty: number; invoicePrice: number;
  poQty: number | null; poPrice: number | null; grnQty: number | null;
  poQtyOk: boolean | null; grnQtyOk: boolean | null; priceOk: boolean | null;
  priceDiffPct: number | null; lineMatches: boolean; issues: string[];
}

export interface MatchStatus {
  invoiceId: string; invoiceNumber: string; invoiceStatus: string;
  supplier?: { code: string; name: string };
  purchaseOrder?: { poNumber: string; status: string };
  goodsReceipt?: { grnNumber: string; status: string; receivedDate: string; condition: string };
  matchStatus: 'no_match' | 'two_way' | 'three_way_matched' | 'three_way_failed';
  allLinesMatch: boolean; priceTolerance: string;
  lines: MatchLine[];
  summary: { total: number; matched: number; failed: number };
  canPost: boolean;
}

export const apInvoicesApi = {
  // ── List & detail ──────────────────────────────────────────────────────────
  getAll: async (params?: { status?: string; supplierId?: string; from?: string; to?: string }) => {
    const res = await apiClient.get('/ap-invoices', { params });
    return extractList(res.data);
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/ap-invoices/${id}`);
    return res.data;
  },

  getKpis: async () => {
    const res = await apiClient.get('/ap-invoices/kpis');
    return res.data;
  },

  getAging: async () => {
    const res = await apiClient.get('/ap-invoices/aging');
    return res.data;
  },

  // ── Create ─────────────────────────────────────────────────────────────────
  createFromPo: async (poId: string) => {
    const res = await apiClient.post(`/ap-invoices/from-po/${poId}`);
    return res.data;
  },

  create: async (data: {
    supplierId: string;
    poId?: string;
    invoiceDate: string;
    dueDate: string;
    supplierRef?: string;
    currency?: string;
    notes?: string;
    lines: Array<{
      poLineId?: string;
      itemId?: string;
      description?: string;
      quantity: number;
      uom?: string;
      unitPrice: number;
      discountPercent?: number;
      inventoryAccountId?: string;
      expenseAccountId?: string;
    }>;
  }) => {
    const res = await apiClient.post('/ap-invoices', data);
    return res.data;
  },

  // ── Update & actions ───────────────────────────────────────────────────────
  update: async (id: string, data: { dueDate?: string; supplierRef?: string; notes?: string }) => {
    const res = await apiClient.patch(`/ap-invoices/${id}`, data);
    return res.data;
  },

  post: async (id: string) => {
    const res = await apiClient.patch(`/ap-invoices/${id}/post`);
    return res.data;
  },

  void: async (id: string) => {
    const res = await apiClient.patch(`/ap-invoices/${id}/void`);
    return res.data;
  },

  applyPayment: async (id: string, data: {
    paymentDate: string;
    amount: number;
    paymentMethod?: string;
    reference?: string;
    notes?: string;
  }) => {
    const res = await apiClient.post(`/ap-invoices/${id}/payments`, data);
    return res.data;
  },

  remove: async (id: string) => {
    await apiClient.delete(`/ap-invoices/${id}`);
  },

  // ── 3-Way Match ────────────────────────────────────────────────────────────

  /** Get per-line 3-way match analysis: PO ↔ GRN ↔ AP Invoice */
  getMatchStatus: async (id: string): Promise<MatchStatus> => {
    const res = await apiClient.get(`/ap-invoices/${id}/match-status`);
    return res.data;
  },

  /** Link a GRN to this invoice — auto-matches lines by poLineId */
  linkGrn: async (id: string, grnId: string): Promise<{ message: string; matchedLines: number; invoice: any }> => {
    const res = await apiClient.post(`/ap-invoices/${id}/link-grn`, { grnId });
    return res.data;
  },

  /** Remove GRN link from a draft invoice */
  unlinkGrn: async (id: string): Promise<{ message: string; invoice: any }> => {
    const res = await apiClient.post(`/ap-invoices/${id}/unlink-grn`);
    return res.data;
  },
};
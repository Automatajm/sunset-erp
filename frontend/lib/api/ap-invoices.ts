import apiClient from './client';

function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}

export const apInvoicesApi = {
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
};
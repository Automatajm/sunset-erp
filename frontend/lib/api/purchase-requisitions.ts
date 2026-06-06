// ─────────────────────────────────────────────────────────────────────────────
// lib/api/purchase-requisitions.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';

export const purchaseRequisitionsApi = {
  getAll: async (params?: { status?: string; priority?: string }) => {
    const res = await apiClient.get('/purchase-requisitions', { params });
    const d = res.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.purchaseRequisitions)) return d.purchaseRequisitions; // spec-020 envelope { purchaseRequisitions, count }
    return Array.isArray(d?.value) ? d.value : [];
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/purchase-requisitions/${id}`);
    return res.data;
  },

  create: async (data: any) => {
    const res = await apiClient.post('/purchase-requisitions', data);
    return res.data;
  },

  update: async (id: string, data: any) => {
    const res = await apiClient.patch(`/purchase-requisitions/${id}`, data);
    return res.data;
  },

  updateStatus: async (id: string, status: string, reason?: string) => {
    const res = await apiClient.patch(`/purchase-requisitions/${id}/status/${status}`, { reason });
    return res.data;
  },

  convertToRfq: async (id: string, data: {
    lineIds: string[];
    rfqTitle: string;
    supplierIds: string[];
    currency?: string;
    responseDeadline?: string;
  }) => {
    const res = await apiClient.post(`/purchase-requisitions/${id}/convert-to-rfq`, data);
    return res.data;
  },

  remove: async (id: string) => {
    await apiClient.delete(`/purchase-requisitions/${id}`);
  },
};

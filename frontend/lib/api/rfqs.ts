// ─────────────────────────────────────────────────────────────────────────────
// lib/api/rfqs.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';

export const rfqsApi = {
  getAll: async (params?: { status?: string }) => {
    const res = await apiClient.get('/rfqs', { params });
    const d = res.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.rfqs)) return d.rfqs; // spec-020 envelope { rfqs, count }
    return Array.isArray(d?.value) ? d.value : [];
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/rfqs/${id}`);
    return res.data;
  },

  getComparison: async (id: string) => {
    const res = await apiClient.get(`/rfqs/${id}/comparison`);
    return res.data;
  },

  create: async (data: any) => {
    const res = await apiClient.post('/rfqs', data);
    return res.data;
  },

  update: async (id: string, data: any) => {
    const res = await apiClient.patch(`/rfqs/${id}`, data);
    return res.data;
  },

  send: async (id: string) => {
    const res = await apiClient.post(`/rfqs/${id}/send`);
    return res.data;
  },

  submitResponse: async (id: string, data: { rfqSupplierId: string; lines: any[] }) => {
    const res = await apiClient.post(`/rfqs/${id}/response`, data);
    return res.data;
  },

  award: async (id: string, data: { awards: any[]; warehouseId?: string }) => {
    const res = await apiClient.post(`/rfqs/${id}/award`, data);
    return res.data;
  },

  cancel: async (id: string) => {
    const res = await apiClient.post(`/rfqs/${id}/cancel`);
    return res.data;
  },

  remove: async (id: string) => {
    await apiClient.delete(`/rfqs/${id}`);
  },
};
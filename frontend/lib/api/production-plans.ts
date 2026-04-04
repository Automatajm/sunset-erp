// ─────────────────────────────────────────────────────────────────────────────
// lib/api/production-plans.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';

export const productionPlansApi = {
  getAll: async (params?: { horizon?: string; status?: string }) => {
    const res = await apiClient.get('/production-plans', { params });
    const d = res.data;
    return Array.isArray(d) ? d : (d?.value && Array.isArray(d.value)) ? d.value : [];
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/production-plans/${id}`);
    return res.data;
  },

  getActualVsPlanned: async (id: string) => {
    const res = await apiClient.get(`/production-plans/${id}/actual-vs-planned`);
    return res.data;
  },

  create: async (data: any) => {
    const res = await apiClient.post('/production-plans', data);
    return res.data;
  },

  update: async (id: string, data: any) => {
    const res = await apiClient.patch(`/production-plans/${id}`, data);
    return res.data;
  },

  updateLine: async (id: string, lineId: string, data: any) => {
    const res = await apiClient.patch(`/production-plans/${id}/lines/${lineId}`, data);
    return res.data;
  },

  updateStatus: async (id: string, status: string) => {
    const res = await apiClient.patch(`/production-plans/${id}/status/${status}`);
    return res.data;
  },

  generateMos: async (id: string, lineIds?: string[]) => {
    const res = await apiClient.post(`/production-plans/${id}/generate-mos`, { lineIds });
    return res.data;
  },

  linkMo: async (id: string, lineId: string, moId: string) => {
    const res = await apiClient.post(`/production-plans/${id}/lines/${lineId}/link-mo`, { moId });
    return res.data;
  },

  remove: async (id: string) => {
    await apiClient.delete(`/production-plans/${id}`);
  },
};

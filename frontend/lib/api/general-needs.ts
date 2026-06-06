// ─────────────────────────────────────────────────────────────────────────────
// lib/api/general-needs.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';

export const generalNeedsApi = {
  getAll: async (params?: { status?: string }) => {
    const res = await apiClient.get('/general-needs', { params });
    const d = res.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.generalNeeds)) return d.generalNeeds; // spec-020 envelope { generalNeeds, count }
    return Array.isArray(d?.value) ? d.value : [];
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/general-needs/${id}`);
    return res.data;
  },

  create: async (data: any) => {
    const res = await apiClient.post('/general-needs', data);
    return res.data;
  },

  update: async (id: string, data: any) => {
    const res = await apiClient.patch(`/general-needs/${id}`, data);
    return res.data;
  },

  updateStatus: async (id: string, status: string) => {
    const res = await apiClient.patch(`/general-needs/${id}/status/${status}`);
    return res.data;
  },

  updateLine: async (id: string, lineId: string, data: any) => {
    const res = await apiClient.patch(`/general-needs/${id}/lines/${lineId}`, data);
    return res.data;
  },

  convertToPr: async (id: string, data: { lineIds: string[]; prTitle: string; priority?: string }) => {
    const res = await apiClient.post(`/general-needs/${id}/convert-to-pr`, data);
    return res.data;
  },

  explodeFromMos: async (id: string, data: { moIds: string[] }) => {
    const res = await apiClient.post(`/general-needs/${id}/explode-mos`, data);
    return res.data;
  },

  remove: async (id: string) => {
    await apiClient.delete(`/general-needs/${id}`);
  },
};
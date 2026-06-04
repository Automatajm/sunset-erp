// ─────────────────────────────────────────────────────────────────────────────
// lib/api/work-centers.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { WorkCenterType } from './types';

// List endpoint returns an envelope { workCenters, count } (spec-010)
function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.workCenters && Array.isArray(d.workCenters)) return d.workCenters;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}

export const workCentersApi = {
  getAll: async (params?: { workCenterType?: WorkCenterType }) => {
    const res = await apiClient.get('/work-centers', { params });
    return extractList(res.data);
  },
  getById: async (id: string) => {
    const res = await apiClient.get(`/work-centers/${id}`);
    return res.data;
  },
  create: async (data: { code: string; name: string; workCenterType?: WorkCenterType; capacityPerHour?: number; efficiencyPercent?: number; costPerHour?: number; isActive?: boolean }) => {
    const res = await apiClient.post('/work-centers', data);
    return res.data;
  },
  update: async (id: string, data: Partial<{ code: string; name: string; workCenterType: WorkCenterType; capacityPerHour: number; efficiencyPercent: number; costPerHour: number; isActive: boolean }>) => {
    const res = await apiClient.patch(`/work-centers/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/work-centers/${id}`);
  },
};
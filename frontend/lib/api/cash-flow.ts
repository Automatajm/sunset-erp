// ─────────────────────────────────────────────────────────────────────────────
// lib/api/cash-flow.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { CashFlowScenario } from './types';
 
function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}
 
export const cashFlowApi = {
  getAll: async (params?: { scenario?: CashFlowScenario }) => {
    const res = await apiClient.get('/cash-flow', { params });
    return extractList(res.data);
  },
  getById: async (id: string) => {
    const res = await apiClient.get(`/cash-flow/${id}`);
    return res.data;
  },
  create: async (data: {
    projectionCode: string; projectionName: string;
    startDate: string; endDate: string;
    scenario: CashFlowScenario; description?: string;
  }) => {
    const res = await apiClient.post('/cash-flow', data);
    return res.data;
  },
  update: async (id: string, data: Partial<{ projectionCode: string; projectionName: string; description: string }>) => {
    const res = await apiClient.patch(`/cash-flow/${id}`, data);
    return res.data;
  },
  addLine: async (id: string, data: {
    lineDate: string; lineType: 'inflow' | 'outflow';
    category: string; amount: number; description?: string; accountId?: string;
  }) => {
    const res = await apiClient.post(`/cash-flow/${id}/lines`, data);
    return res.data;
  },
  updateLine: async (id: string, lineId: string, data: Partial<{ amount: number; description: string; category: string }>) => {
    const res = await apiClient.patch(`/cash-flow/${id}/lines/${lineId}`, data);
    return res.data;
  },
  removeLine: async (id: string, lineId: string): Promise<void> => {
    await apiClient.delete(`/cash-flow/${id}/lines/${lineId}`);
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/cash-flow/${id}`);
  },
};
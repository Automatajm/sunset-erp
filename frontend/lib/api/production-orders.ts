// ─────────────────────────────────────────────────────────────────────────────
// lib/api/production-orders.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { ProductionOrderStatus, ProductionPriority } from './types';
 
function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}
 
export const productionOrdersApi = {
  getAll: async (params?: { status?: ProductionOrderStatus }) => {
    const res = await apiClient.get('/production-orders', { params });
    return extractList(res.data);
  },
  getById: async (id: string) => {
    const res = await apiClient.get(`/production-orders/${id}`);
    return res.data;
  },
  create: async (data: {
    bomId: string;
    quantityToProduce: number;
    plannedStartDate?: string;
    plannedEndDate?: string;
    priority?: ProductionPriority;
    notes?: string;
  }) => {
    const res = await apiClient.post('/production-orders', data);
    return res.data;
  },
  update: async (id: string, data: Partial<{ quantityToProduce: number; plannedStartDate: string; plannedEndDate: string; priority: ProductionPriority; notes: string }>) => {
    const res = await apiClient.patch(`/production-orders/${id}`, data);
    return res.data;
  },
  updateStatus: async (id: string, status: ProductionOrderStatus) => {
    const res = await apiClient.patch(`/production-orders/${id}/status`, { status });
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/production-orders/${id}`);
  },
};
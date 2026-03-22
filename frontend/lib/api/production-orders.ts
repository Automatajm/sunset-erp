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
  // ── Existing ──────────────────────────────────
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
    quantityOrdered: number;
    plannedStartDate?: string;
    plannedEndDate?: string;
    priority?: ProductionPriority;
    notes?: string;
  }) => {
    const res = await apiClient.post('/production-orders', data);
    return res.data;
  },
  update: async (id: string, data: Partial<{
    quantityToProduce: number; plannedStartDate: string;
    plannedEndDate: string; priority: ProductionPriority; notes: string;
  }>) => {
    const res = await apiClient.patch(`/production-orders/${id}`, data);
    return res.data;
  },
  updateStatus: async (id: string, status: ProductionOrderStatus) => {
    const res = await apiClient.patch(`/production-orders/${id}/status/${status}`);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/production-orders/${id}`);
  },

  // ── Sprint 6 — Labor Actuals ──────────────────
  addLaborActual: async (moId: string, data: {
    workDate?: string; employeeId?: string; employeeName?: string;
    hoursPlanned?: number; hoursActual: number; laborRate?: number; notes?: string;
  }) => {
    const res = await apiClient.post(`/production-orders/${moId}/labor-actuals`, data);
    return res.data;
  },
  getLaborActuals: async (moId: string) => {
    const res = await apiClient.get(`/production-orders/${moId}/labor-actuals`);
    return res.data;
  },

  // ── Sprint 6 — Material Actuals ───────────────
  addMaterialActual: async (moId: string, data: {
    itemId: string; qtyPlanned: number; qtyActual: number;
    unitCost?: number; notes?: string;
  }) => {
    const res = await apiClient.post(`/production-orders/${moId}/material-actuals`, data);
    return res.data;
  },
  getMaterialActuals: async (moId: string) => {
    const res = await apiClient.get(`/production-orders/${moId}/material-actuals`);
    return res.data;
  },

  // ── Sprint 6 — FG Delivery ────────────────────
  deliverFg: async (moId: string, data: {
    quantityDelivered: number; warehouseId?: string;
    unitCost?: number; notes?: string;
  }) => {
    const res = await apiClient.post(`/production-orders/${moId}/deliver`, data);
    return res.data;
  },

  // ── Sprint 6 — Variances ──────────────────────
  getVariances: async (moId: string) => {
    const res = await apiClient.get(`/production-orders/${moId}/variances`);
    return res.data;
  },
  getAllVariances: async (params?: { status?: string; varianceType?: string }) => {
    const res = await apiClient.get('/production-orders/variances', { params });
    return res.data;
  },
  postVarianceJe: async (varianceId: string, data?: {
    debitAccountId?: string; creditAccountId?: string; notes?: string;
  }) => {
    const res = await apiClient.patch(`/production-orders/variances/${varianceId}/post-je`, data ?? {});
    return res.data;
  },
};
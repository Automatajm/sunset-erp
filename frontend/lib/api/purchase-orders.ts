// ─────────────────────────────────────────────────────────────────────────────
// lib/api/purchase-orders.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto, POStatus } from './types';

function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}

export const purchaseOrdersApi = {
  getAll: async (params?: { status?: POStatus; supplierId?: string }) => {
    const res = await apiClient.get('/purchase-orders', { params });
    return extractList(res.data);
  },
  getById: async (id: string) => {
    const res = await apiClient.get(`/purchase-orders/${id}`);
    return res.data;
  },
  create: async (data: CreatePurchaseOrderDto) => {
    const res = await apiClient.post('/purchase-orders', data);
    return res.data;
  },
  update: async (id: string, data: UpdatePurchaseOrderDto) => {
    const res = await apiClient.patch(`/purchase-orders/${id}`, data);
    return res.data;
  },
  updateStatus: async (id: string, status: 'approved' | 'rejected' | 'closed') => {
    const res = await apiClient.patch(`/purchase-orders/${id}/status`, { status });
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/purchase-orders/${id}`);
  },
};
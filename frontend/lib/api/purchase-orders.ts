// ─────────────────────────────────────────────────────────────────────────────
// lib/api/purchase-orders.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';

export const purchaseOrdersApi = {
  getAll: async (params?: { status?: string }) => {
    const res = await apiClient.get('/purchase-orders', { params });
    const d = res.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.purchaseOrders)) return d.purchaseOrders; // spec-020 envelope { purchaseOrders, count }
    return Array.isArray(d?.value) ? d.value : [];
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/purchase-orders/${id}`);
    return res.data;
  },

  create: async (data: any) => {
    const res = await apiClient.post('/purchase-orders', data);
    return res.data;
  },

  update: async (id: string, data: any) => {
    const res = await apiClient.patch(`/purchase-orders/${id}`, data);
    return res.data;
  },

  updateStatus: async (id: string, status: string) => {
    const res = await apiClient.patch(`/purchase-orders/${id}/status/${status}`);
    return res.data;
  },

  receive: async (id: string, data: { warehouseId: string; lines: { lineId: string; receivedQuantity: number; unitCost?: number; lotNumber?: string }[]; notes?: string }) => {
    const res = await apiClient.post(`/purchase-orders/${id}/receive`, data);
    return res.data;
  },

  remove: async (id: string) => {
    await apiClient.delete(`/purchase-orders/${id}`);
  },
};
// ─────────────────────────────────────────────────────────────────────────────
// lib/api/purchase-orders.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { PurchaseOrder, CreatePurchaseOrderDto, UpdatePurchaseOrderDto, POStatus } from './types';
 
export const purchaseOrdersApi = {
  getAll: async (params?: { status?: POStatus }): Promise<PurchaseOrder[]> => {
    const res = await apiClient.get('/purchase-orders', { params });
    return res.data;
  },
  getById: async (id: string): Promise<PurchaseOrder> => {
    const res = await apiClient.get(`/purchase-orders/${id}`);
    return res.data;
  },
  create: async (data: CreatePurchaseOrderDto): Promise<PurchaseOrder> => {
    const res = await apiClient.post('/purchase-orders', data);
    return res.data;
  },
  update: async (id: string, data: UpdatePurchaseOrderDto): Promise<PurchaseOrder> => {
    const res = await apiClient.patch(`/purchase-orders/${id}`, data);
    return res.data;
  },
  updateStatus: async (id: string, status: 'approved' | 'rejected' | 'closed'): Promise<PurchaseOrder> => {
    const res = await apiClient.patch(`/purchase-orders/${id}/status/${status}`);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/purchase-orders/${id}`);
  },
};
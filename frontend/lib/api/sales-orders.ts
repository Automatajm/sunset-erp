// ─────────────────────────────────────────────────────────────────────────────
// lib/api/sales-orders.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { CreateSalesOrderDto, UpdateSalesOrderDto, SOStatus } from './types';

function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}

export const salesOrdersApi = {
  getAll: async (params?: { status?: SOStatus; customerId?: string }) => {
    const res = await apiClient.get('/sales-orders', { params });
    return extractList(res.data);
  },
  getById: async (id: string) => {
    const res = await apiClient.get(`/sales-orders/${id}`);
    return res.data;
  },
  create: async (data: CreateSalesOrderDto) => {
    const res = await apiClient.post('/sales-orders', data);
    return res.data;
  },
  update: async (id: string, data: UpdateSalesOrderDto) => {
    const res = await apiClient.patch(`/sales-orders/${id}`, data);
    return res.data;
  },
  updateStatus: async (id: string, status: 'confirmed' | 'shipped' | 'delivered' | 'closed') => {
    const res = await apiClient.patch(`/sales-orders/${id}/status`, { status });
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/sales-orders/${id}`);
  },
};
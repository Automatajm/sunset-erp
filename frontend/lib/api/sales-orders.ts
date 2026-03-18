// ─────────────────────────────────────────────────────────────────────────────
// lib/api/sales-orders.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { SalesOrder, CreateSalesOrderDto, UpdateSalesOrderDto, SOStatus } from './types';
 
export const salesOrdersApi = {
  getAll: async (params?: { status?: SOStatus }): Promise<SalesOrder[]> => {
    const res = await apiClient.get('/sales-orders', { params });
    return res.data;
  },
  getById: async (id: string): Promise<SalesOrder> => {
    const res = await apiClient.get(`/sales-orders/${id}`);
    return res.data;
  },
  create: async (data: CreateSalesOrderDto): Promise<SalesOrder> => {
    const res = await apiClient.post('/sales-orders', data);
    return res.data;
  },
  update: async (id: string, data: UpdateSalesOrderDto): Promise<SalesOrder> => {
    const res = await apiClient.patch(`/sales-orders/${id}`, data);
    return res.data;
  },
  updateStatus: async (id: string, status: 'confirmed' | 'shipped' | 'delivered' | 'closed'): Promise<SalesOrder> => {
    const res = await apiClient.patch(`/sales-orders/${id}/status/${status}`);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/sales-orders/${id}`);
  },
};
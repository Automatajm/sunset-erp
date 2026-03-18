// ─────────────────────────────────────────────────────────────────────────────
// lib/api/production-orders.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import {
  ProductionOrder,
  CreateProductionOrderDto,
  UpdateProductionOrderDto,
  ProductionOrderStatus,
} from './types';
 
export const productionOrdersApi = {
  getAll: async (params?: { status?: ProductionOrderStatus }): Promise<ProductionOrder[]> => {
    const res = await apiClient.get('/production-orders', { params });
    return res.data;
  },
  getById: async (id: string): Promise<ProductionOrder> => {
    const res = await apiClient.get(`/production-orders/${id}`);
    return res.data;
  },
  create: async (data: CreateProductionOrderDto): Promise<ProductionOrder> => {
    const res = await apiClient.post('/production-orders', data);
    return res.data;
  },
  update: async (id: string, data: UpdateProductionOrderDto): Promise<ProductionOrder> => {
    const res = await apiClient.patch(`/production-orders/${id}`, data);
    return res.data;
  },
  updateStatus: async (
    id: string,
    status: 'released' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<ProductionOrder> => {
    const res = await apiClient.patch(`/production-orders/${id}/status/${status}`);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/production-orders/${id}`);
  },
};
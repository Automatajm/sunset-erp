// ─────────────────────────────────────────────────────────────────────────────
// lib/api/warehouses.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { Warehouse, CreateWarehouseDto, UpdateWarehouseDto } from './types';
 
export const warehousesApi = {
  getAll: async (): Promise<Warehouse[]> => {
    const res = await apiClient.get('/warehouses');
    return res.data;
  },
  getById: async (id: string): Promise<Warehouse> => {
    const res = await apiClient.get(`/warehouses/${id}`);
    return res.data;
  },
  create: async (data: CreateWarehouseDto): Promise<Warehouse> => {
    const res = await apiClient.post('/warehouses', data);
    return res.data;
  },
  update: async (id: string, data: UpdateWarehouseDto): Promise<Warehouse> => {
    const res = await apiClient.patch(`/warehouses/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/warehouses/${id}`);
  },
};
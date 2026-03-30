// ─────────────────────────────────────────────────────────────────────────────
// lib/api/warehouses.ts  ← REPLACE EXISTING FILE
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
  getLocationTree: async (id: string): Promise<any[]> => {
    const res = await apiClient.get(`/warehouses/${id}/location-tree`);
    return res.data;
  },
  getStats: async (id: string): Promise<any> => {
    const res = await apiClient.get(`/warehouses/${id}/stats`);
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
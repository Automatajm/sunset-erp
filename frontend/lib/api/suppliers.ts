// ─────────────────────────────────────────────────────────────────────────────
// lib/api/suppliers.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { Supplier, CreateSupplierDto, UpdateSupplierDto } from './types';
 
export const suppliersApi = {
  getAll: async (): Promise<Supplier[]> => {
    // List endpoint returns an envelope { suppliers, count } (spec-002)
    const res = await apiClient.get('/suppliers');
    return res.data.suppliers ?? [];
  },
  getById: async (id: string): Promise<Supplier> => {
    const res = await apiClient.get(`/suppliers/${id}`);
    return res.data;
  },
  create: async (data: CreateSupplierDto): Promise<Supplier> => {
    const res = await apiClient.post('/suppliers', data);
    return res.data;
  },
  update: async (id: string, data: UpdateSupplierDto): Promise<Supplier> => {
    const res = await apiClient.patch(`/suppliers/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/suppliers/${id}`);
  },
};
// --- frontend/lib/api/supplier-items.ts ---
import apiClient from './client';
import { SupplierItem, CreateSupplierItemDto, UpdateSupplierItemDto } from './types';
 
type SupplierItemsEnvelope = { supplierItems: SupplierItem[]; count: number };

export const supplierItemsApi = {
  getAll: async (params?: { itemId?: string; supplierId?: string; isPreferred?: boolean }): Promise<SupplierItem[]> => {
    const res = await apiClient.get('/supplier-items', { params });
    return (res.data as SupplierItemsEnvelope).supplierItems;
  },
  getByItem: async (itemId: string): Promise<SupplierItem[]> => {
    const res = await apiClient.get(`/supplier-items/by-item/${itemId}`);
    return (res.data as SupplierItemsEnvelope).supplierItems;
  },
  getBySupplier: async (supplierId: string): Promise<SupplierItem[]> => {
    const res = await apiClient.get(`/supplier-items/by-supplier/${supplierId}`);
    return (res.data as SupplierItemsEnvelope).supplierItems;
  },
  getById: async (id: string): Promise<SupplierItem> => {
    const res = await apiClient.get(`/supplier-items/${id}`);
    return res.data;
  },
  create: async (data: CreateSupplierItemDto): Promise<SupplierItem> => {
    const res = await apiClient.post('/supplier-items', data);
    return res.data;
  },
  update: async (id: string, data: UpdateSupplierItemDto): Promise<SupplierItem> => {
    const res = await apiClient.patch(`/supplier-items/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/supplier-items/${id}`);
  },
};
// ─────────────────────────────────────────────────────────────────────────────
// lib/api/items.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { Item, CreateItemDto, UpdateItemDto, ItemType } from './types';
 
export interface ItemStatistics {
  total: number;
  byType: { type: ItemType; count: number }[];
  stockable: number;
  purchasable: number;
  saleable: number;
}
 
export const itemsApi = {
  getAll: async (params?: { itemType?: ItemType }): Promise<Item[]> => {
    // List endpoint returns an envelope { items, count } (spec-003)
    const res = await apiClient.get('/items', { params });
    return res.data.items ?? [];
  },
  getById: async (id: string): Promise<Item> => {
    const res = await apiClient.get(`/items/${id}`);
    return res.data;
  },
  getStatistics: async (): Promise<ItemStatistics> => {
    const res = await apiClient.get('/items/statistics');
    return res.data;
  },
  create: async (data: CreateItemDto): Promise<Item> => {
    const res = await apiClient.post('/items', data);
    return res.data;
  },
  update: async (id: string, data: UpdateItemDto): Promise<Item> => {
    const res = await apiClient.patch(`/items/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/items/${id}`);
  },
};
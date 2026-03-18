// ─────────────────────────────────────────────────────────────────────────────
// lib/api/bom.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { Bom, CreateBomDto, UpdateBomDto } from './types';
 
export const bomApi = {
  getAll: async (params?: { itemId?: string }): Promise<Bom[]> => {
    const res = await apiClient.get('/bom', { params });
    return res.data;
  },
  getById: async (id: string): Promise<Bom> => {
    const res = await apiClient.get(`/bom/${id}`);
    return res.data;
  },
  calculate: async (id: string, quantity: number) => {
    const res = await apiClient.get(`/bom/${id}/calculate/${quantity}`);
    return res.data;
  },
  create: async (data: CreateBomDto): Promise<Bom> => {
    const res = await apiClient.post('/bom', data);
    return res.data;
  },
  update: async (id: string, data: UpdateBomDto): Promise<Bom> => {
    const res = await apiClient.patch(`/bom/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/bom/${id}`);
  },
};
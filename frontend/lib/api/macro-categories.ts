// --- frontend/lib/api/macro-categories.ts ---
import apiClient from './client';
import { MacroCategory, CreateMacroCategoryDto, UpdateMacroCategoryDto } from './types';
 
export const macroCategoriesApi = {
  getAll: async (): Promise<MacroCategory[]> => {
    // List endpoint returns an envelope { macroCategories, count } (spec-006)
    const res = await apiClient.get('/macro-categories');
    return res.data.macroCategories ?? [];
  },
  getById: async (id: string): Promise<MacroCategory> => {
    const res = await apiClient.get(`/macro-categories/${id}`);
    return res.data;
  },
  create: async (data: CreateMacroCategoryDto): Promise<MacroCategory> => {
    const res = await apiClient.post('/macro-categories', data);
    return res.data;
  },
  update: async (id: string, data: UpdateMacroCategoryDto): Promise<MacroCategory> => {
    const res = await apiClient.patch(`/macro-categories/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/macro-categories/${id}`);
  },
};
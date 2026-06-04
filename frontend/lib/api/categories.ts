// --- frontend/lib/api/categories.ts ---
import apiClient from './client';
import { Category, CreateCategoryDto, UpdateCategoryDto } from './types';
 
export const categoriesApi = {
  getAll: async (params?: { macroCategoryId?: string }): Promise<Category[]> => {
    // List endpoint returns an envelope { categories, count } (spec-009)
    const res = await apiClient.get('/categories', { params });
    return res.data.categories ?? [];
  },
  getById: async (id: string): Promise<Category> => {
    const res = await apiClient.get(`/categories/${id}`);
    return res.data;
  },
  create: async (data: CreateCategoryDto): Promise<Category> => {
    const res = await apiClient.post('/categories', data);
    return res.data;
  },
  update: async (id: string, data: UpdateCategoryDto): Promise<Category> => {
    const res = await apiClient.patch(`/categories/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/categories/${id}`);
  },
};
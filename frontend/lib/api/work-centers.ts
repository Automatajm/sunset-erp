// ─────────────────────────────────────────────────────────────────────────────
// lib/api/work-centers.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { WorkCenter, CreateWorkCenterDto, UpdateWorkCenterDto } from './types';
 
export const workCentersApi = {
  getAll: async (): Promise<WorkCenter[]> => {
    const res = await apiClient.get('/work-centers');
    return res.data;
  },
  getById: async (id: string): Promise<WorkCenter> => {
    const res = await apiClient.get(`/work-centers/${id}`);
    return res.data;
  },
  create: async (data: CreateWorkCenterDto): Promise<WorkCenter> => {
    const res = await apiClient.post('/work-centers', data);
    return res.data;
  },
  update: async (id: string, data: UpdateWorkCenterDto): Promise<WorkCenter> => {
    const res = await apiClient.patch(`/work-centers/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/work-centers/${id}`);
  },
};
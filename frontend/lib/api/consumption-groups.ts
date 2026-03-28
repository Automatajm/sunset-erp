// --- frontend/lib/api/consumption-groups.ts ---
import apiClient from './client';
import { ConsumptionGroup, CreateConsumptionGroupDto, UpdateConsumptionGroupDto } from './types';
 
export const consumptionGroupsApi = {
  getAll: async (): Promise<ConsumptionGroup[]> => {
    const res = await apiClient.get('/consumption-groups');
    return res.data;
  },
  getById: async (id: string): Promise<ConsumptionGroup> => {
    const res = await apiClient.get(`/consumption-groups/${id}`);
    return res.data;
  },
  create: async (data: CreateConsumptionGroupDto): Promise<ConsumptionGroup> => {
    const res = await apiClient.post('/consumption-groups', data);
    return res.data;
  },
  update: async (id: string, data: UpdateConsumptionGroupDto): Promise<ConsumptionGroup> => {
    const res = await apiClient.patch(`/consumption-groups/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/consumption-groups/${id}`);
  },
};
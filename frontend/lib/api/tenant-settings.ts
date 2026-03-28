// --- frontend/lib/api/tenant-settings.ts ---
import apiClient from './client';
import { TenantSettings, UpdateTenantSettingsDto } from './types';
 
export const tenantSettingsApi = {
  get: async (): Promise<TenantSettings> => {
    const res = await apiClient.get('/tenant-settings');
    return res.data;
  },
  update: async (data: UpdateTenantSettingsDto): Promise<TenantSettings> => {
    const res = await apiClient.patch('/tenant-settings', data);
    return res.data;
  },
};
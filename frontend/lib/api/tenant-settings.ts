// --- frontend/lib/api/tenant-settings.ts ---
import apiClient from './client';

export const tenantSettingsApi = {
  get: async () => {
    const res = await apiClient.get('/tenant-settings');
    return res.data;
  },

  update: async (data: any) => {
    const res = await apiClient.patch('/tenant-settings', data);
    return res.data;
  },

  /**
   * Returns the system UOMs configured for this tenant.
   * Shape: { volume, mass, length, area, count, list: UomUnit[] }
   */
  getSystemUoms: async () => {
    const res = await apiClient.get('/tenant-settings/system-uoms');
    return res.data as {
      volume: any; mass: any; length: any; area: any; count: any;
      list: { id: string; code: string; name: string; type: string; system: string }[];
    };
  },
};
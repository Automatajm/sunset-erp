// ─────────────────────────────────────────────────────────────────────────────
// lib/api/bom.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
 
function extractList(data: unknown) {
  if (Array.isArray(data)) return data;
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value;
  return [];
}
 
export const bomApi = {
  getAll: async (params?: { parentItemId?: string; isActive?: boolean }) => {
    const res = await apiClient.get('/bom', { params });
    return extractList(res.data);
  },
  getById: async (id: string) => {
    const res = await apiClient.get(`/bom/${id}`);
    return res.data;
  },
  create: async (data: {
    parentItemId: string;
    bomNumber?: string;
    version?: number;
    isActive?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string;
    components: { componentItemId: string; quantityPer: number; uom: string; scrapPercent?: number; isPhantom?: boolean }[];
  }) => {
    const res = await apiClient.post('/bom', data);
    return res.data;
  },
  update: async (id: string, data: Partial<{ bomNumber: string; version: number; isActive: boolean }>) => {
    const res = await apiClient.patch(`/bom/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/bom/${id}`);
  },
};
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
    parentItemId: string; bomNumber?: string; version?: number; isActive?: boolean;
    effectiveFrom?: string; effectiveTo?: string;
    components: { componentItemId: string; quantity: number; uom: string; scrapPercent?: number; isPhantom?: boolean }[];
  }) => {
    const payload = {
      itemId:   data.parentItemId,
      bomCode:  data.bomNumber,
      version:  data.version?.toString(),
      isActive: data.isActive,
      components: data.components.map(c => ({
        componentItemId: c.componentItemId,
        quantity:        c.quantity,
        uom:             c.uom,
        scrapPercent:    c.scrapPercent,
      })),
    };
    const res = await apiClient.post('/bom', payload);
    return res.data;
  },
  update: async (id: string, data: Partial<{ bomNumber: string; version: number; isActive: boolean }>) => {
    const res = await apiClient.patch(`/bom/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/bom/${id}`);
  },

  // ── Routing ───────────────────────────────────
  getRouting: async (bomId: string) => {
    const res = await apiClient.get(`/bom/${bomId}/routing`);
    return res.data;
  },
  addRoutingStep: async (bomId: string, data: {
    stepNumber: number; workCenterId: string; description?: string;
    setupTime?: number; runTimePerUnit?: number; notes?: string;
  }) => {
    const res = await apiClient.post(`/bom/${bomId}/routing`, data);
    return res.data;
  },
  updateRoutingStep: async (bomId: string, stepId: string, data: {
    stepNumber?: number; workCenterId?: string; description?: string;
    setupTime?: number; runTimePerUnit?: number; isActive?: boolean; notes?: string;
  }) => {
    const res = await apiClient.patch(`/bom/${bomId}/routing/${stepId}`, data);
    return res.data;
  },
  removeRoutingStep: async (bomId: string, stepId: string) => {
    const res = await apiClient.delete(`/bom/${bomId}/routing/${stepId}`);
    return res.data;
  },
  getLaborEstimate: async (bomId: string, quantity: number) => {
    const res = await apiClient.get(`/bom/${bomId}/routing/labor-estimate/${quantity}`);
    return res.data;
  },
  getMaterialSuggestions: async (bomId: string, quantity: number) => {
    const res = await apiClient.get(`/bom/${bomId}/material-suggestions/${quantity}`);
    return res.data;
  },
};
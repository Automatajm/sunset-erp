import apiClient from './client';

export const automationApi = {
  getConfigs: async () => {
    const res = await apiClient.get('/automation/config');
    return res.data;
  },
  updateConfig: async (module: string, data: { mode: string; isEnabled?: boolean; notes?: string }) => {
    const res = await apiClient.patch(`/automation/config/${module}`, data);
    return res.data;
  },
  getQueue: async (params?: { status?: string; eventType?: string }) => {
    const res = await apiClient.get('/automation/queue', { params });
    return res.data;
  },
  getQueueStats: async () => {
    const res = await apiClient.get('/automation/queue/stats');
    return res.data;
  },
  approveQueueItem: async (id: string, notes?: string) => {
    const res = await apiClient.patch(`/automation/queue/${id}/approve`, { notes });
    return res.data;
  },
  rejectQueueItem: async (id: string, rejectReason: string, notes?: string) => {
    const res = await apiClient.patch(`/automation/queue/${id}/reject`, { rejectReason, notes });
    return res.data;
  },
};
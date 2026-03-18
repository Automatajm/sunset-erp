// ─────────────────────────────────────────────────────────────────────────────
// lib/api/cash-flow.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import {
  CashFlowProjection,
  CreateCashFlowProjectionDto,
  UpdateCashFlowProjectionDto,
  CreateCashFlowLineDto,
  CashFlowScenario,
} from './types';
 
export const cashFlowApi = {
  getAll: async (params?: { scenario?: CashFlowScenario }): Promise<CashFlowProjection[]> => {
    const res = await apiClient.get('/cash-flow', { params });
    return res.data;
  },
  getById: async (id: string): Promise<CashFlowProjection> => {
    const res = await apiClient.get(`/cash-flow/${id}`);
    return res.data;
  },
  getSummary: async (id: string) => {
    const res = await apiClient.get(`/cash-flow/${id}/summary`);
    return res.data;
  },
  create: async (data: CreateCashFlowProjectionDto): Promise<CashFlowProjection> => {
    const res = await apiClient.post('/cash-flow', data);
    return res.data;
  },
  update: async (id: string, data: UpdateCashFlowProjectionDto): Promise<CashFlowProjection> => {
    const res = await apiClient.patch(`/cash-flow/${id}`, data);
    return res.data;
  },
  addLine: async (id: string, data: CreateCashFlowLineDto) => {
    const res = await apiClient.post(`/cash-flow/${id}/lines`, data);
    return res.data;
  },
  updateLine: async (id: string, lineId: string, data: Partial<CreateCashFlowLineDto>) => {
    const res = await apiClient.patch(`/cash-flow/${id}/lines/${lineId}`, data);
    return res.data;
  },
  removeLine: async (id: string, lineId: string): Promise<void> => {
    await apiClient.delete(`/cash-flow/${id}/lines/${lineId}`);
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/cash-flow/${id}`);
  },
};
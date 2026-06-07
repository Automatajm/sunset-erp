// ─────────────────────────────────────────────────────────────────────────────
// lib/api/budgets.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import {
  Budget,
  CreateBudgetDto,
  UpdateBudgetDto,
  CreateBudgetLineDto,
  BudgetStatus,
} from './types';

export const budgetsApi = {
  getAll: async (params?: { fiscalYear?: string; status?: BudgetStatus }): Promise<Budget[]> => {
    const res = await apiClient.get('/budgets', { params });
    // spec-029 envelope { budgets, count }; tolerate legacy bare array
    const d = res.data;
    return Array.isArray(d) ? d : (d?.budgets ?? []);
  },
  getById: async (id: string): Promise<Budget> => {
    const res = await apiClient.get(`/budgets/${id}`);
    return res.data;
  },
  create: async (data: CreateBudgetDto): Promise<Budget> => {
    const res = await apiClient.post('/budgets', data);
    return res.data;
  },
  update: async (id: string, data: UpdateBudgetDto): Promise<Budget> => {
    const res = await apiClient.patch(`/budgets/${id}`, data);
    return res.data;
  },
  approve: async (id: string): Promise<Budget> => {
    const res = await apiClient.patch(`/budgets/${id}/approve`);
    return res.data;
  },
  getVsActual: async (id: string, params?: { startPeriod?: string; endPeriod?: string }) => {
    const res = await apiClient.get(`/budgets/${id}/vs-actual`, { params });
    return res.data;
  },
  addLine: async (id: string, data: CreateBudgetLineDto) => {
    const res = await apiClient.post(`/budgets/${id}/lines`, data);
    return res.data;
  },
  updateLine: async (id: string, lineId: string, data: Partial<CreateBudgetLineDto>) => {
    const res = await apiClient.patch(`/budgets/${id}/lines/${lineId}`, data);
    return res.data;
  },
  removeLine: async (id: string, lineId: string): Promise<void> => {
    await apiClient.delete(`/budgets/${id}/lines/${lineId}`);
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/budgets/${id}`);
  },
  generateFromSo: async (id: string, data: {
    soStatuses: string[];
    overwrite?: boolean;
    defaultMaterialAccount?: string;
    defaultLaborAccount?: string;
    defaultRevenueAccount?: string;
  }) => {
    const res = await apiClient.post(`/budgets/${id}/generate-from-so`, data);
    return res.data;
  },
};
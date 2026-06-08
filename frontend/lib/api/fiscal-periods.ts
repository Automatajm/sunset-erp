// ─────────────────────────────────────────────────────────────────────────────
// lib/api/fiscal-periods.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import {
  FiscalPeriod,
  CreateFiscalPeriodDto,
  UpdateFiscalPeriodDto,
  PeriodStatus,
} from './types';
 
function extractList(data: unknown): FiscalPeriod[] {
  if (Array.isArray(data)) return data as FiscalPeriod[];
  const d = data as Record<string, unknown>;
  // spec-033 envelope { fiscalPeriods, count }; tolerate legacy shapes
  if (Array.isArray(d?.fiscalPeriods)) return d.fiscalPeriods as FiscalPeriod[];
  if (d?.value && Array.isArray(d.value)) return d.value as FiscalPeriod[];
  return [];
}
 
export const fiscalPeriodsApi = {
  getAll: async (params?: {
    fiscalYear?: string;
    status?: PeriodStatus;
  }): Promise<FiscalPeriod[]> => {
    const res = await apiClient.get('/fiscal-periods', { params });
    return extractList(res.data);
  },
  getCurrent: async (): Promise<FiscalPeriod> => {
    const res = await apiClient.get('/fiscal-periods/current');
    return res.data;
  },
  getById: async (id: string): Promise<FiscalPeriod> => {
    const res = await apiClient.get(`/fiscal-periods/${id}`);
    return res.data;
  },
  create: async (data: CreateFiscalPeriodDto): Promise<FiscalPeriod> => {
    const res = await apiClient.post('/fiscal-periods', data);
    return res.data;
  },
  update: async (id: string, data: UpdateFiscalPeriodDto): Promise<FiscalPeriod> => {
    const res = await apiClient.patch(`/fiscal-periods/${id}`, data);
    return res.data;
  },
  close: async (id: string): Promise<FiscalPeriod> => {
    const res = await apiClient.patch(`/fiscal-periods/${id}/close`);
    return res.data;
  },
  reopen: async (id: string): Promise<FiscalPeriod> => {
    const res = await apiClient.patch(`/fiscal-periods/${id}/reopen`);
    return res.data;
  },
  lock: async (id: string): Promise<FiscalPeriod> => {
    const res = await apiClient.patch(`/fiscal-periods/${id}/lock`);
    return res.data;
  },
  unlock: async (id: string): Promise<FiscalPeriod> => {
    const res = await apiClient.patch(`/fiscal-periods/${id}/unlock`);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/fiscal-periods/${id}`);
  },
};
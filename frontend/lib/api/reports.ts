// ─────────────────────────────────────────────────────────────────────────────
// lib/api/financial-reports.ts  (updated with correct ReportFilters)
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { ReportFilters } from './types';
 
export const financialReportsApi = {
  getTrialBalance: async (params?: ReportFilters) => {
    const res = await apiClient.get('/financial-reports/trial-balance', { params });
    return res.data;
  },
  getProfitAndLoss: async (params?: ReportFilters) => {
    const res = await apiClient.get('/financial-reports/profit-and-loss', { params });
    return res.data;
  },
  getBalanceSheet: async (params?: ReportFilters) => {
    const res = await apiClient.get('/financial-reports/balance-sheet', { params });
    return res.data;
  },
  getGeneralLedger: async (params?: ReportFilters) => {
    const res = await apiClient.get('/financial-reports/general-ledger', { params });
    return res.data;
  },
};
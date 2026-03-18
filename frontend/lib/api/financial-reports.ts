// ─────────────────────────────────────────────────────────────────────────────
// lib/api/financial-reports.ts  (real response shapes — no wrapper)
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
 
export interface ReportParams {
  startDate?: string;
  endDate?: string;
  fiscalPeriod?: string;
  accountType?: string;
  accountNumber?: string;
}
 
export const financialReportsApi = {
  getTrialBalance: async (params?: ReportParams) => {
    const res = await apiClient.get('/financial-reports/trial-balance', { params });
    return res.data;
  },
  getProfitAndLoss: async (params?: ReportParams) => {
    const res = await apiClient.get('/financial-reports/profit-and-loss', { params });
    return res.data;
  },
  getBalanceSheet: async (params?: ReportParams) => {
    const res = await apiClient.get('/financial-reports/balance-sheet', { params });
    return res.data;
  },
  getGeneralLedger: async (params?: ReportParams) => {
    const res = await apiClient.get('/financial-reports/general-ledger', { params });
    return res.data;
  },
};
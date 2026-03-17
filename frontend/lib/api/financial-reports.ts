import apiClient from './client';

export interface ProfitAndLoss {
  revenue: number;
  expenses: number;
  netIncome: number;
  period: string;
}

export interface BalanceSheet {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cashBalance: number;
  date: string;
}

export const financialReportsApi = {
  // Get Profit & Loss statement
  getProfitAndLoss: async (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ProfitAndLoss> => {
    const response = await apiClient.get('/financial-reports/profit-and-loss', {
      params,
    });
    return response.data;
  },

  // Get Balance Sheet
  getBalanceSheet: async (params?: {
    date?: string;
  }): Promise<BalanceSheet> => {
    const response = await apiClient.get('/financial-reports/balance-sheet', {
      params,
    });
    return response.data;
  },

  // Get Trial Balance
  getTrialBalance: async (params?: {
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await apiClient.get('/financial-reports/trial-balance', {
      params,
    });
    return response.data;
  },
};

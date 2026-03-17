import apiClient from './client';

export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  accountCategory: string;
  parentAccountId?: string;
  allowManualPosting: boolean;
  isActive: boolean;
  balance?: number;
  createdAt: string;
  updatedAt: string;
}

export const chartOfAccountsApi = {
  // Get all accounts
  getAll: async (params?: {
    accountType?: string;
    isActive?: boolean;
    search?: string;
  }): Promise<Account[]> => {
    const response = await apiClient.get('/chart-of-accounts', { params });
    return response.data;
  },

  // Get single account
  getById: async (id: string): Promise<Account> => {
    const response = await apiClient.get(`/chart-of-accounts/${id}`);
    return response.data;
  },

  // Create account
  create: async (data: Partial<Account>): Promise<Account> => {
    const response = await apiClient.post('/chart-of-accounts', data);
    return response.data;
  },

  // Update account
  update: async (id: string, data: Partial<Account>): Promise<Account> => {
    const response = await apiClient.patch(`/chart-of-accounts/${id}`, data);
    return response.data;
  },

  // Delete account
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/chart-of-accounts/${id}`);
  },
};

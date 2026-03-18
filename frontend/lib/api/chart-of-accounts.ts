// ─────────────────────────────────────────────────────────────────────────────
// lib/api/chart-of-accounts.ts  (FIXED — real field names from backend)
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { Account, CreateAccountDto, UpdateAccountDto, AccountType } from './types';
 
// Backend returns { value: Account[], Count: number } for list endpoints
function extractList(data: any): Account[] {
  if (Array.isArray(data)) return data;
  if (data?.value && Array.isArray(data.value)) return data.value;
  return [];
}
 
export const chartOfAccountsApi = {
  getAll: async (params?: { accountType?: AccountType }): Promise<Account[]> => {
    const res = await apiClient.get('/chart-of-accounts', { params });
    return extractList(res.data);
  },
  getByType: async (): Promise<Record<AccountType, Account[]>> => {
    const res = await apiClient.get('/chart-of-accounts/by-type');
    return res.data;
  },
  getByCode: async (code: string): Promise<Account> => {
    const res = await apiClient.get(`/chart-of-accounts/code/${code}`);
    return res.data;
  },
  getById: async (id: string): Promise<Account> => {
    const res = await apiClient.get(`/chart-of-accounts/${id}`);
    return res.data;
  },
  create: async (data: CreateAccountDto): Promise<Account> => {
    const res = await apiClient.post('/chart-of-accounts', data);
    return res.data;
  },
  update: async (id: string, data: UpdateAccountDto): Promise<Account> => {
    const res = await apiClient.patch(`/chart-of-accounts/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/chart-of-accounts/${id}`);
  },
};
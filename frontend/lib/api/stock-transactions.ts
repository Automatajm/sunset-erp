// ─────────────────────────────────────────────────────────────────────────────
// lib/api/stock-transactions.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import {
  StockTransaction,
  StockBalance,
  CreateStockTransactionDto,
  TransactionType,
} from './types';
 
export const stockTransactionsApi = {
  getAll: async (params?: {
    itemId?: string;
    warehouseId?: string;
    transactionType?: TransactionType;
  }): Promise<StockTransaction[]> => {
    const res = await apiClient.get('/stock-transactions', { params });
    return res.data;
  },
  getById: async (id: string): Promise<StockTransaction> => {
    const res = await apiClient.get(`/stock-transactions/${id}`);
    return res.data;
  },
  getBalance: async (params?: {
    itemId?: string;
    warehouseId?: string;
  }): Promise<StockBalance[]> => {
    const res = await apiClient.get('/stock-transactions/balance', { params });
    return res.data;
  },
  create: async (data: CreateStockTransactionDto): Promise<StockTransaction> => {
    const res = await apiClient.post('/stock-transactions', data);
    return res.data;
  },
};
// ─────────────────────────────────────────────────────────────────────────────
// FILE: frontend/lib/api/stock-transactions.ts
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

  // Returns all 3 UOM quantities + WAC per stock record (ADR-014, ADR-019)
  getBalance: async (params?: {
    itemId?: string;
    warehouseId?: string;
  }): Promise<StockBalance[]> => {
    const res = await apiClient.get('/stock-transactions/balance', { params });
    return res.data;
  },

  getValuation: async (params?: {
    warehouseId?: string;
    itemType?: string;
  }) => {
    const res = await apiClient.get('/stock-transactions/valuation', { params });
    return res.data;
  },

  getLedger: async (params?: {
    itemId?: string;
    warehouseId?: string;
    movementType?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const res = await apiClient.get('/stock-transactions/ledger', { params });
    return res.data;
  },

  getPlanning: async (params?: {
    warehouseId?: string;
    itemType?: string;
    alertOnly?: boolean;
  }) => {
    const res = await apiClient.get('/stock-transactions/planning', { params });
    return res.data;
  },

  create: async (data: CreateStockTransactionDto): Promise<StockTransaction> => {
    const res = await apiClient.post('/stock-transactions', data);
    return res.data;
  },
};
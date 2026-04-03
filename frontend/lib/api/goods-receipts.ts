// ============================================================================
// FILE: frontend/lib/api/goods-receipts.ts
// ============================================================================
import apiClient from './client';

export interface GrnLine {
  id: string;
  lineNumber: number;
  itemId: string;
  item?: { code: string; name: string; baseUom: string };
  poLineId?: string;
  purchaseOrderLine?: { orderedQuantity: string; unitPrice: string };
  warehouseId: string;
  receivedQuantity: string;
  uom: string;
  unitCost?: string;
  lotNumber?: string;
  expiryDate?: string;
  notes?: string;
}

export interface GoodsReceipt {
  id: string;
  grnNumber: string;
  poId?: string;
  poNumber?: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  supplierId?: string;
  supplierCode?: string;
  supplierName?: string;
  receivedDate: string;
  status: 'posted' | 'cancelled';
  condition: string;
  notes?: string;
  supplierRef?: string;
  lineCount?: number;
  totalValue?: number;
  lines?: GrnLine[];
  createdAt: string;
}

export interface GrnStats {
  total: number;
  posted: number;
  cancelled: number;
  today: number;
  totalValue: number;
}

export interface CreateGrnLineDto {
  poLineId?: string;
  itemId: string;
  receivedQuantity: number;
  uom: string;
  unitCost?: number;
  lotNumber?: string;
  expiryDate?: string;
  notes?: string;
}

export interface CreateGoodsReceiptDto {
  poId?: string;
  warehouseId: string;
  receivedDate?: string;
  condition?: string;
  notes?: string;
  supplierRef?: string;
  lines: CreateGrnLineDto[];
}

export const goodsReceiptsApi = {
  getAll: async (): Promise<GoodsReceipt[]> => {
    const res = await apiClient.get('/goods-receipts');
    return Array.isArray(res.data) ? res.data : [];
  },

  getStats: async (): Promise<GrnStats> => {
    const res = await apiClient.get('/goods-receipts/stats');
    return res.data;
  },

  getById: async (id: string): Promise<GoodsReceipt> => {
    const res = await apiClient.get(`/goods-receipts/${id}`);
    return res.data;
  },

  getByPo: async (poId: string): Promise<GoodsReceipt[]> => {
    const res = await apiClient.get(`/goods-receipts/by-po/${poId}`);
    return Array.isArray(res.data) ? res.data : [];
  },

  create: async (data: CreateGoodsReceiptDto): Promise<GoodsReceipt> => {
    const res = await apiClient.post('/goods-receipts', data);
    return res.data;
  },

  update: async (id: string, data: { condition?: string; notes?: string }): Promise<GoodsReceipt> => {
    const res = await apiClient.patch(`/goods-receipts/${id}`, data);
    return res.data;
  },

  cancel: async (id: string): Promise<{ message: string; id: string }> => {
    const res = await apiClient.post(`/goods-receipts/${id}/cancel`);
    return res.data;
  },
};
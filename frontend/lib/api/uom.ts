// --- frontend/lib/api/uom.ts ---
import apiClient from './client';
import { UomUnit, UomConversion, UomConvertResult } from './types';
 
export const uomApi = {
  getUnits: async (params?: { type?: string; system?: string }): Promise<UomUnit[]> => {
    const res = await apiClient.get('/uom/units', { params });
    return res.data;
  },
  getById: async (id: string): Promise<UomUnit> => {
    const res = await apiClient.get(`/uom/units/${id}`);
    return res.data;
  },
  getConversions: async (): Promise<UomConversion[]> => {
    const res = await apiClient.get('/uom/conversions');
    return res.data;
  },
  convert: async (from: string, to: string, qty: number): Promise<UomConvertResult> => {
    const res = await apiClient.get('/uom/convert', { params: { from, to, qty } });
    return res.data;
  },
};
// ─────────────────────────────────────────────────────────────────────────────
// FILE: frontend/lib/api/warehouse-locations.ts  ← CREATE NEW FILE
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';

// ── Types ────────────────────────────────────────────────────────────────────

export interface WZone {
  id: string; tenantId: string; warehouseId: string;
  code: string; name: string; zoneType: string;
  description?: string; isActive: boolean;
  aisles?: WAisle[];
  _count?: { aisles: number };
}

export interface WAisle {
  id: string; tenantId: string; zoneId: string;
  code: string; name?: string; fullCode: string; isActive: boolean;
  racks?: WRack[];
  _count?: { racks: number };
}

export interface WRack {
  id: string; tenantId: string; aisleId: string;
  code: string; name?: string; fullCode: string; isActive: boolean;
  levels?: WLevel[];
}

export interface WLevel {
  id: string; tenantId: string; rackId: string;
  code: string; name?: string; fullCode: string; isActive: boolean;
  maxWeightKg?: number; maxVolumeLtr?: number; maxPallets?: number;
  bins?: WBin[];
  _count?: { bins: number; stock: number };
}

export interface WBin {
  id: string; tenantId: string; levelId: string;
  code: string; name?: string; fullCode: string;
  binType: string; maxWeightKg?: number; maxVolumeLtr?: number; maxPallets?: number;
  allowMixedItems: boolean; isActive: boolean; notes?: string;
  _count?: { stock: number };
}

// ── API ───────────────────────────────────────────────────────────────────────

export const warehouseLocationsApi = {

  // Zones
  createZone: async (data: { warehouseId: string; code: string; name: string; zoneType?: string; description?: string; isActive?: boolean }) => {
    const res = await apiClient.post('/warehouse-locations/zones', data);
    return res.data as WZone;
  },
  getZones: async (warehouseId: string) => {
    const res = await apiClient.get(`/warehouse-locations/zones/by-warehouse/${warehouseId}`);
    return (res.data as { zones: WZone[]; count: number }).zones;
  },
  updateZone: async (id: string, data: Partial<{ code: string; name: string; zoneType: string; description: string; isActive: boolean }>) => {
    const res = await apiClient.patch(`/warehouse-locations/zones/${id}`, data);
    return res.data as WZone;
  },
  deleteZone: async (id: string) => {
    await apiClient.delete(`/warehouse-locations/zones/${id}`);
  },

  // Aisles
  createAisle: async (data: { zoneId: string; code: string; name?: string; isActive?: boolean }) => {
    const res = await apiClient.post('/warehouse-locations/aisles', data);
    return res.data as WAisle;
  },
  getAisles: async (zoneId: string) => {
    const res = await apiClient.get(`/warehouse-locations/aisles/by-zone/${zoneId}`);
    return (res.data as { aisles: WAisle[]; count: number }).aisles;
  },
  updateAisle: async (id: string, data: Partial<{ code: string; name: string; isActive: boolean }>) => {
    const res = await apiClient.patch(`/warehouse-locations/aisles/${id}`, data);
    return res.data as WAisle;
  },
  deleteAisle: async (id: string) => {
    await apiClient.delete(`/warehouse-locations/aisles/${id}`);
  },

  // Racks
  createRack: async (data: { aisleId: string; code: string; name?: string; isActive?: boolean }) => {
    const res = await apiClient.post('/warehouse-locations/racks', data);
    return res.data as WRack;
  },
  getRacks: async (aisleId: string) => {
    const res = await apiClient.get(`/warehouse-locations/racks/by-aisle/${aisleId}`);
    return (res.data as { racks: WRack[]; count: number }).racks;
  },
  updateRack: async (id: string, data: Partial<{ code: string; name: string; isActive: boolean }>) => {
    const res = await apiClient.patch(`/warehouse-locations/racks/${id}`, data);
    return res.data as WRack;
  },
  deleteRack: async (id: string) => {
    await apiClient.delete(`/warehouse-locations/racks/${id}`);
  },

  // Levels
  createLevel: async (data: { rackId: string; code: string; name?: string; isActive?: boolean; maxWeightKg?: number; maxVolumeLtr?: number; maxPallets?: number }) => {
    const res = await apiClient.post('/warehouse-locations/levels', data);
    return res.data as WLevel;
  },
  getLevels: async (rackId: string) => {
    const res = await apiClient.get(`/warehouse-locations/levels/by-rack/${rackId}`);
    return (res.data as { levels: WLevel[]; count: number }).levels;
  },
  updateLevel: async (id: string, data: Partial<{ code: string; name: string; isActive: boolean; maxWeightKg: number; maxVolumeLtr: number; maxPallets: number }>) => {
    const res = await apiClient.patch(`/warehouse-locations/levels/${id}`, data);
    return res.data as WLevel;
  },
  deleteLevel: async (id: string) => {
    await apiClient.delete(`/warehouse-locations/levels/${id}`);
  },

  // Bins
  createBin: async (data: { levelId: string; code: string; name?: string; binType?: string; maxWeightKg?: number; maxVolumeLtr?: number; maxPallets?: number; allowMixedItems?: boolean; isActive?: boolean; notes?: string }) => {
    const res = await apiClient.post('/warehouse-locations/bins', data);
    return res.data as WBin;
  },
  getBins: async (levelId: string) => {
    const res = await apiClient.get(`/warehouse-locations/bins/by-level/${levelId}`);
    return (res.data as { bins: WBin[]; count: number }).bins;
  },
  updateBin: async (id: string, data: Partial<{ code: string; name: string; binType: string; maxWeightKg: number; maxVolumeLtr: number; maxPallets: number; allowMixedItems: boolean; isActive: boolean; notes: string }>) => {
    const res = await apiClient.patch(`/warehouse-locations/bins/${id}`, data);
    return res.data as WBin;
  },
  deleteBin: async (id: string) => {
    await apiClient.delete(`/warehouse-locations/bins/${id}`);
  },
};
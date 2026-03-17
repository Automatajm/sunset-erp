import apiClient from './client';
import { JournalEntry } from './types';

export const journalEntriesApi = {
  // Get all journal entries
  getAll: async (params?: {
    limit?: number;
    status?: string;
    fiscalPeriod?: string;
  }): Promise<JournalEntry[]> => {
    const response = await apiClient.get('/journal-entries', { params });
    return response.data;
  },

  // Get single journal entry
  getById: async (id: string) => {
    const response = await apiClient.get(`/journal-entries/${id}`);
    return response.data;
  },

  // Create journal entry
  create: async (data: any) => {
    const response = await apiClient.post('/journal-entries', data);
    return response.data;
  },
};

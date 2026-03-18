import apiClient from './client';
import { JournalEntry, CreateJournalEntryDto, UpdateJournalEntryDto, EntryStatus } from './types';

function extractList(data: unknown): JournalEntry[] {
  if (Array.isArray(data)) return data as JournalEntry[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as JournalEntry[];
  return [];
}

export const journalEntriesApi = {
  getAll: async (params?: { status?: EntryStatus }): Promise<JournalEntry[]> => {
    const res = await apiClient.get('/journal-entries', { params });
    return extractList(res.data);
  },
  getById: async (id: string): Promise<JournalEntry> => {
    const res = await apiClient.get(`/journal-entries/${id}`);
    return res.data;
  },
  create: async (data: CreateJournalEntryDto): Promise<JournalEntry> => {
    const res = await apiClient.post('/journal-entries', data);
    return res.data;
  },
  update: async (id: string, data: UpdateJournalEntryDto): Promise<JournalEntry> => {
    const res = await apiClient.patch(`/journal-entries/${id}`, data);
    return res.data;
  },
  post: async (id: string): Promise<JournalEntry> => {
    const res = await apiClient.patch(`/journal-entries/${id}/post`);
    return res.data;
  },
  unpost: async (id: string): Promise<JournalEntry> => {
    const res = await apiClient.patch(`/journal-entries/${id}/unpost`);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/journal-entries/${id}`);
  },
};
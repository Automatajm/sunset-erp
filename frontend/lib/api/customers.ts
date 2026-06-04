// ─────────────────────────────────────────────────────────────────────────────
// lib/api/customers.ts
// ─────────────────────────────────────────────────────────────────────────────
import apiClient from './client';
import { Customer, CreateCustomerDto, UpdateCustomerDto } from './types';
 
export const customersApi = {
  getAll: async (): Promise<Customer[]> => {
    // List endpoint returns an envelope { customers, count } (spec-013)
    const res = await apiClient.get('/customers');
    return res.data.customers ?? [];
  },
  getById: async (id: string): Promise<Customer> => {
    const res = await apiClient.get(`/customers/${id}`);
    return res.data;
  },
  create: async (data: CreateCustomerDto): Promise<Customer> => {
    const res = await apiClient.post('/customers', data);
    return res.data;
  },
  update: async (id: string, data: UpdateCustomerDto): Promise<Customer> => {
    const res = await apiClient.patch(`/customers/${id}`, data);
    return res.data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/customers/${id}`);
  },
};
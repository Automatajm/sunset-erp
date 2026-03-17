import apiClient from './client';
import { LoginRequest, LoginResponse } from './types';

export const authApi = {
  // Login
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post<LoginResponse>('/auth/login', credentials);
    return response.data;
  },

  // Get current user profile
  getProfile: async () => {
    const response = await apiClient.get('/auth/profile');
    return response.data;
  },

  // Check auth status
  checkAuth: async () => {
    const response = await apiClient.get('/auth/check');
    return response.data;
  },
};

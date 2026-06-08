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

  // spec-034 — revoke the refresh token + clear the httpOnly cookie
  logout: async () => {
    const response = await apiClient.post('/auth/logout', {});
    return response.data;
  },
};

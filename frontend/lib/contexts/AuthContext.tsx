"use client";
// FILE: frontend/lib/contexts/AuthContext.tsx
// spec-034 — access token in memory only; session restored on load via a silent
// refresh (the apiClient interceptor refreshes the httpOnly cookie when the
// first call 401s). No token is ever read from or written to localStorage.

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../api/types';
import { authApi } from '../api/auth';
import { setAccessToken, clearAccessToken, broadcastLogout } from '../api/token-store';

interface AuthContextType {
  user:            User | null;
  tenantName:      string;
  isAuthenticated: boolean;
  isLoading:       boolean;
  login:           (email: string, password: string) => Promise<void>;
  logout:          () => void;
  checkAuth:       () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// tenant_name is non-sensitive display text (not a credential); spec-034 allows
// persisting display data for first-paint UX as long as it is NOT the token.
const TENANT_NAME_KEY = 'tenant_name';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,       setUser]       = useState<User | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [isLoading,  setIsLoading]  = useState(true);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      // First-paint tenant name (display only) for no flash; cleared on logout.
      const savedTenant = typeof window !== 'undefined' ? localStorage.getItem(TENANT_NAME_KEY) : null;
      if (savedTenant) setTenantName(savedTenant);

      // No token in memory yet → getProfile 401 → the apiClient interceptor
      // silently refreshes the httpOnly cookie and retries. If the 8h refresh
      // window is alive the session resumes; otherwise this throws.
      const profile   = await authApi.getProfile();
      const freshUser = profile.user ?? profile;
      setUser(freshUser);
    } catch {
      // Not authenticated — leave user null. Route protection redirects to login.
      setUser(null);
      clearAccessToken();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login({ email, password });
      // Multi-tenant accounts must pick a tenant first (handled by the login
      // page); only a tenant-scoped token is kept here.
      if (response.requiresTenantSelection) return;

      setAccessToken(response.access_token);
      setUser(response.user);
      if (response.tenant?.name) {
        setTenantName(response.tenant.name);
        localStorage.setItem(TENANT_NAME_KEY, response.tenant.name);
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  };

  const logout = () => {
    // Best-effort server-side revoke; clear local state regardless.
    authApi.logout().catch(() => {});
    clearAccessToken();
    localStorage.removeItem(TENANT_NAME_KEY);
    broadcastLogout(); // sign other tabs out too
    setUser(null);
    setTenantName('');
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user, tenantName, isAuthenticated: !!user,
      isLoading, login, logout, checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

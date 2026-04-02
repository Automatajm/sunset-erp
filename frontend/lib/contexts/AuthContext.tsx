"use client";
// FILE: frontend/lib/contexts/AuthContext.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../api/types';
import { authApi } from '../api/auth';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,       setUser]       = useState<User | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [isLoading,  setIsLoading]  = useState(true);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) { setIsLoading(false); return; }

      // 1 — Restore immediately from localStorage to avoid flash on navigation
      const savedUser   = localStorage.getItem('user');
      const savedTenant = localStorage.getItem('tenant_name');
      if (savedUser)   setUser(JSON.parse(savedUser));
      if (savedTenant) setTenantName(savedTenant);

      // 2 — Validate token + get fresh user with role from backend
      const profile   = await authApi.getProfile();
      // getProfile returns { message, user: req.user, tenantId }
      // req.user is now the full enriched object from jwt.strategy.ts
      const freshUser = profile.user ?? profile;
      setUser(freshUser);
      localStorage.setItem('user', JSON.stringify(freshUser));
    } catch {
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login({ email, password });

      // Save token
      localStorage.setItem('access_token', response.access_token);

      // Save user — backend now returns firstName/lastName in login response
      const userData = response.user;
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);

      // Save tenant name
      if (response.tenant?.name) {
        localStorage.setItem('tenant_name', response.tenant.name);
        setTenantName(response.tenant.name);
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant_name');
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
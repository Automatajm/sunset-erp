// Authentication types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
  permissions: string[];
}

// API Error Response
export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// Common API Response
export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  error?: ApiError;
}

// Financial types
export interface KPIData {
  revenue: number;
  expenses: number;
  cashFlow: number;
  bankBalance: number;
  revenueTrend: number;
  expensesTrend: number;
  cashFlowTrend: number;
  bankBalanceTrend: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  status: 'draft' | 'posted';
  totalDebit: number;
  totalCredit: number;
}

export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  balance?: number;
}

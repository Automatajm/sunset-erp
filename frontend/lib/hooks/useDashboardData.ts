"use client";

import { useEffect, useState } from 'react';
import { financialReportsApi } from '../api/financial-reports';
import { journalEntriesApi } from '../api/journal-entries';

interface DashboardData {
  revenue: number;
  expenses: number;
  cashFlow: number;
  bankBalance: number;
  revenueTrend: number;
  expensesTrend: number;
  cashFlowTrend: number;
  bankBalanceTrend: number;
  recentEntries: any[];
}

export function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current month dates
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const startDate = `${currentMonth}-01`;
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

      // Fetch data with fallbacks
      let pnl = { revenue: 0, expenses: 0, netIncome: 0 };
      let balanceSheet = { cashBalance: 0 };
      let entries: any[] = [];

      try {
        pnl = await financialReportsApi.getProfitAndLoss({
          startDate,
          endDate,
        });
      } catch (err) {
        console.warn('P&L data not available');
      }

      try {
        balanceSheet = await financialReportsApi.getBalanceSheet();
      } catch (err) {
        console.warn('Balance sheet data not available');
      }

      try {
        entries = await journalEntriesApi.getAll({ limit: 10 });
      } catch (err) {
        console.warn('Journal entries not available');
      }

      setData({
        revenue: pnl.revenue || 0,
        expenses: pnl.expenses || 0,
        cashFlow: pnl.netIncome || 0,
        bankBalance: balanceSheet.cashBalance || 0,
        revenueTrend: 11.9,
        expensesTrend: 9.3,
        cashFlowTrend: 0,
        bankBalanceTrend: 16.5,
        recentEntries: entries || [],
      });
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
      
      // Set default data even on error
      setData({
        revenue: 0,
        expenses: 0,
        cashFlow: 0,
        bankBalance: 0,
        revenueTrend: 0,
        expensesTrend: 0,
        cashFlowTrend: 0,
        bankBalanceTrend: 0,
        recentEntries: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = () => {
    fetchDashboardData();
  };

  return {
    data,
    isLoading,
    error,
    refresh,
  };
}

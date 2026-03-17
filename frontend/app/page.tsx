"use client";

import { useAuth } from '@/lib/contexts/AuthContext';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { StatCard } from '@/components/ui/stat-card';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

function Home() {
  const { user, logout } = useAuth();
  const { data, isLoading, error, refresh } = useDashboardData();

  const formatCurrency = (value: number | undefined | null) => {
    const amount = value || 0;
    if (isNaN(amount)) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar - NetSuite Style */}
      <nav className="bg-primary h-14 border-b border-border flex items-center px-6">
        <div className="flex items-center gap-8">
          <h1 className="text-white font-bold text-xl">SUNSET ERP</h1>
          <div className="flex gap-6 text-sm">
            <a href="#" className="text-white/90 hover:text-white">Home</a>
            <a href="#" className="text-white/90 hover:text-white">Activities</a>
            <a href="#" className="text-white/90 hover:text-white">Sales</a>
            <a href="#" className="text-white/90 hover:text-white">Financial</a>
            <a href="#" className="text-white/90 hover:text-white">Reports</a>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <input 
            type="search" 
            placeholder="Search..." 
            className="bg-primary-foreground/10 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/60"
          />
          <div className="text-white text-sm">{user?.name || user?.email}</div>
          <button
            onClick={logout}
            className="text-white/90 hover:text-white text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Breadcrumbs */}
      <div className="bg-muted border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Home &gt; Dashboard
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={isLoading}>
          {isLoading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Main Content */}
      <main className="p-6">
        {/* Loading State */}
        {isLoading && !data && (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-danger/10 border border-danger/20 rounded-lg p-4 mb-6">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {/* Dashboard Content */}
        {data && (
          <>
            {/* KPI Cards - NO trends to avoid NaN */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                title="Revenue"
                value={formatCurrency(data.revenue)}
                description="Current month"
              />

              <StatCard
                title="Expenses"
                value={formatCurrency(data.expenses)}
                description="Current month"
              />

              <StatCard
                title="Cash Flow"
                value={formatCurrency(data.cashFlow)}
                description="Current month"
              />

              <StatCard
                title="Bank Balance"
                value={formatCurrency(data.bankBalance)}
                description="As of today"
              />
            </div>

            {/* Recent Transactions */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Recent Journal Entries
              </h3>
              {data.recentEntries.length > 0 ? (
                <div className="space-y-2">
                  {data.recentEntries.slice(0, 5).map((entry: any) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {entry.entryNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {entry.description || 'No description'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {formatCurrency(entry.totalDebit)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.entryDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recent transactions
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function ProtectedHome() {
  return <Home />;
}

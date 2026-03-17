"use client";

import { useAuth } from '@/lib/contexts/AuthContext';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import MainLayout from '@/components/layout/MainLayout';
import { Card, Title, Text, Metric, Flex, BadgeDelta, Grid } from '@tremor/react';

function DashboardContent() {
  const { data, isLoading, error, refresh } = useDashboardData();

  const formatCurrency = (value: number | undefined | null) => {
    const amount = value || 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-tremor-content-emphasis dark:text-dark-tremor-content-emphasis">
            Loading dashboard...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Title>Dashboard</Title>
        <Text>Overview of your business metrics</Text>
      </div>

      {error && (
        <Card className="mb-6 border-red-500">
          <Text className="text-red-600">{error}</Text>
        </Card>
      )}

      {data && (
        <>
          {/* KPI Cards */}
          <Grid numItemsSm={2} numItemsLg={4} className="gap-6 mb-6">
            <Card decoration="top" decorationColor="blue">
              <Flex justifyContent="between" alignItems="center">
                <Text>Revenue</Text>
                {data.revenue > 0 && data.revenueTrend !== 0 && (
                  <BadgeDelta deltaType={data.revenueTrend > 0 ? "increase" : "decrease"}>
                    {Math.abs(data.revenueTrend)}%
                  </BadgeDelta>
                )}
              </Flex>
              <Metric>{formatCurrency(data.revenue)}</Metric>
              <Text className="mt-1">Current month</Text>
            </Card>

            <Card decoration="top" decorationColor="red">
              <Flex justifyContent="between" alignItems="center">
                <Text>Expenses</Text>
                {data.expenses > 0 && data.expensesTrend !== 0 && (
                  <BadgeDelta deltaType="decrease">
                    {Math.abs(data.expensesTrend)}%
                  </BadgeDelta>
                )}
              </Flex>
              <Metric>{formatCurrency(data.expenses)}</Metric>
              <Text className="mt-1">Current month</Text>
            </Card>

            <Card decoration="top" decorationColor="emerald">
              <Text>Cash Flow</Text>
              <Metric>{formatCurrency(data.cashFlow)}</Metric>
              <Text className="mt-1">Current month</Text>
            </Card>

            <Card decoration="top" decorationColor="indigo">
              <Flex justifyContent="between" alignItems="center">
                <Text>Bank Balance</Text>
                {data.bankBalance > 0 && data.bankBalanceTrend !== 0 && (
                  <BadgeDelta deltaType={data.bankBalanceTrend > 0 ? "increase" : "decrease"}>
                    {Math.abs(data.bankBalanceTrend)}%
                  </BadgeDelta>
                )}
              </Flex>
              <Metric>{formatCurrency(data.bankBalance)}</Metric>
              <Text className="mt-1">As of today</Text>
            </Card>
          </Grid>

          {/* Recent Journal Entries */}
          <Card>
            <Title>Recent Journal Entries</Title>
            {data.recentEntries.length > 0 ? (
              <div className="mt-4 space-y-3">
                {data.recentEntries.slice(0, 5).map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-3 border-b border-tremor-border dark:border-dark-tremor-border last:border-0"
                  >
                    <div>
                      <Text className="font-medium">{entry.entryNumber}</Text>
                      <Text className="text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                        {entry.description || 'No description'}
                      </Text>
                    </div>
                    <div className="text-right">
                      <Text className="font-medium">{formatCurrency(entry.totalDebit)}</Text>
                      <Text className="text-tremor-content-subtle dark:text-dark-tremor-content-subtle">
                        {new Date(entry.entryDate).toLocaleDateString()}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Text className="mt-4">No recent transactions</Text>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <MainLayout>
      <DashboardContent />
    </MainLayout>
  );
}

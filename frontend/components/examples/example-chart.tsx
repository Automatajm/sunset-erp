"use client"

import { ChartContainer, chartColors } from "@/components/ui/chart"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"

const revenueData = [
  { month: "Jan", revenue: 45000, expenses: 32000 },
  { month: "Feb", revenue: 52000, expenses: 35000 },
  { month: "Mar", revenue: 48000, expenses: 33000 },
  { month: "Apr", revenue: 61000, expenses: 38000 },
  { month: "May", revenue: 55000, expenses: 36000 },
  { month: "Jun", revenue: 67000, expenses: 40000 },
]

export function RevenueChart() {
  return (
    <ChartContainer
      title="Revenue vs Expenses"
      description="Monthly comparison for 2026"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={revenueData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
            }}
          />
          <Bar dataKey="revenue" fill={chartColors.success} />
          <Bar dataKey="expenses" fill={chartColors.danger} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

export function TrendChart() {
  return (
    <ChartContainer
      title="Cash Flow Trend"
      description="Last 6 months"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={revenueData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "6px",
            }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke={chartColors.primary}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

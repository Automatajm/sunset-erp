"use client"

import { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type Account = {
  id: string
  accountNumber: string
  name: string
  type: string
  balance: number
  status: "active" | "inactive"
}

const columns: ColumnDef<Account>[] = [
  {
    accessorKey: "accountNumber",
    header: "Account #",
  },
  {
    accessorKey: "name",
    header: "Name",
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      return (
        <Badge variant="outline">
          {row.getValue("type")}
        </Badge>
      )
    },
  },
  {
    accessorKey: "balance",
    header: "Balance",
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue("balance"))
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(amount)
      return <div className="font-medium">{formatted}</div>
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string
      return (
        <Badge variant={status === "active" ? "success" : "secondary"}>
          {status}
        </Badge>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return (
        <Button variant="ghost" size="sm">
          View
        </Button>
      )
    },
  },
]

const sampleData: Account[] = [
  {
    id: "1",
    accountNumber: "1000",
    name: "Cash",
    type: "Asset",
    balance: 50000,
    status: "active",
  },
  {
    id: "2",
    accountNumber: "4000",
    name: "Sales Revenue",
    type: "Revenue",
    balance: 125000,
    status: "active",
  },
  {
    id: "3",
    accountNumber: "5000",
    name: "Cost of Goods Sold",
    type: "Expense",
    balance: 75000,
    status: "active",
  },
]

export function ExampleTable() {
  return (
    <DataTable
      columns={columns}
      data={sampleData}
      searchKey="name"
      searchPlaceholder="Search accounts..."
      onRowClick={(row) => console.log("Clicked:", row)}
    />
  )
}

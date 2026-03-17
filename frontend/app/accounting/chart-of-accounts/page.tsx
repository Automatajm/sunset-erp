"use client";

import { useEffect, useState } from 'react';
import { chartOfAccountsApi, Account } from '@/lib/api/chart-of-accounts';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { ColumnDef } from '@tanstack/react-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import MainLayout from '@/components/layout/MainLayout';

function ChartOfAccountsContent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    accountNumber: '',
    name: '',
    accountType: '',
    accountCategory: '',
    allowManualPosting: true,
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const data = await chartOfAccountsApi.getAll();
      setAccounts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load accounts');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await chartOfAccountsApi.create(formData);
      setIsCreateModalOpen(false);
      setFormData({
        accountNumber: '',
        name: '',
        accountType: '',
        accountCategory: '',
        allowManualPosting: true,
      });
      fetchAccounts();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: ColumnDef<Account>[] = [
    {
      accessorKey: 'accountNumber',
      header: 'Account #',
    },
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'accountType',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.getValue('accountType')}
        </Badge>
      ),
    },
    {
      accessorKey: 'accountCategory',
      header: 'Category',
    },
    {
      accessorKey: 'allowManualPosting',
      header: 'Manual Posting',
      cell: ({ row }) => (
        <Badge variant={row.getValue('allowManualPosting') ? 'success' : 'secondary'}>
          {row.getValue('allowManualPosting') ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.getValue('isActive') ? 'success' : 'secondary'}>
          {row.getValue('isActive') ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
  ];

  return (
    <div className="p-6">
      {/* Breadcrumbs */}
      <div className="text-sm text-muted-foreground mb-4">
        Home &gt; Accounting &gt; Chart of Accounts
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Chart of Accounts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account structure
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          Create Account
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
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

      {/* Table */}
      {!isLoading && (
        <DataTable
          columns={columns}
          data={accounts}
          searchKey="name"
          searchPlaceholder="Search accounts..."
        />
      )}

      {/* Create Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="name">Account Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="accountType">Account Type</Label>
                <Select
                  id="accountType"
                  value={formData.accountType}
                  onChange={(e) => setFormData({ ...formData, accountType: e.target.value })}
                  required
                >
                  <option value="">Select type...</option>
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Equity</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="accountCategory">Category</Label>
                <Input
                  id="accountCategory"
                  value={formData.accountCategory}
                  onChange={(e) => setFormData({ ...formData, accountCategory: e.target.value })}
                  required
                />
              </div>

              <Checkbox
                id="allowManualPosting"
                label="Allow Manual Posting"
                checked={formData.allowManualPosting}
                onChange={(e) => setFormData({ ...formData, allowManualPosting: e.target.checked })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ChartOfAccountsPage() {
  return (
    <MainLayout>
      <ChartOfAccountsContent />
    </MainLayout>
  );
}

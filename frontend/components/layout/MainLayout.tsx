"use client";

import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const navigation = [
    {
      name: 'Dashboard',
      href: '/',
      icon: '🏠',
    },
    {
      name: 'Accounting',
      icon: '💰',
      children: [
        { name: 'Chart of Accounts', href: '/accounting/chart-of-accounts' },
        { name: 'Journal Entries', href: '/accounting/journal-entries' },
        { name: 'Financial Reports', href: '/accounting/reports' },
      ],
    },
    {
      name: 'Sales',
      icon: '💼',
      children: [
        { name: 'Customers', href: '/sales/customers' },
        { name: 'Sales Orders', href: '/sales/orders' },
      ],
    },
    {
      name: 'Inventory',
      icon: '📦',
      children: [
        { name: 'Items', href: '/inventory/items' },
        { name: 'Warehouses', href: '/inventory/warehouses' },
        { name: 'Stock Transactions', href: '/inventory/transactions' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-60 bg-card border-r border-border flex-shrink-0">
        {/* Logo */}
        <div className="h-14 border-b border-border flex items-center px-4">
          <h1 className="text-lg font-bold text-primary">SUNSET ERP</h1>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => (
            <div key={item.name}>
              {item.href ? (
                <button
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-primary text-white'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.name}</span>
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </div>
                  {item.children && (
                    <div className="ml-4 space-y-1">
                      {item.children.map((child) => (
                        <button
                          key={child.name}
                          onClick={() => router.push(child.href)}
                          className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                            pathname === child.href
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-foreground hover:bg-muted'
                          }`}
                        >
                          {child.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="h-14 bg-primary border-b border-border flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <input 
              type="search" 
              placeholder="Search..." 
              className="bg-primary-foreground/10 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/60 w-64"
            />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white text-sm">{user?.name || user?.email}</span>
            <button
              onClick={logout}
              className="text-white/90 hover:text-white text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded transition-colors"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

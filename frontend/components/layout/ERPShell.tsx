"use client";

import { useState, useRef } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

interface NavLeaf  { label: string; href: string; }
interface NavGroup { label: string; items: NavLeaf[]; }
interface NavItem  { label: string; href?: string; groups?: NavGroup[]; }

const NAV: NavItem[] = [
  { label: 'Home', href: '/' },
  {
    label: 'Procurement',
    groups: [
      { label: 'Suppliers',  items: [{ label: 'Suppliers', href: '/procurement/suppliers' }] },
      { label: 'Purchasing', items: [{ label: 'Purchase Orders', href: '/procurement/purchase-orders' }, 
                                     { label: 'Goods Receipts',  href: '/procurement/goods-receipts' },
                                     { label: 'AP Invoices',     href: '/procurement/ap-invoices' }] },
    ],
  },
  {
    label: 'Inventory',
    groups: [
      {
        label: 'Master Data',
        items: [
          { label: 'Items',              href: '/inventory/items' },
          { label: 'Warehouses',         href: '/inventory/warehouses' },
          { label: 'Macro Categories',   href: '/inventory/macro-categories' },
          { label: 'Categories',         href: '/inventory/categories' },
          { label: 'Consumption Groups', href: '/inventory/consumption-groups' },
        ],
      },
      {
        label: 'Transactions',
        items: [
          { label: 'Stock Transactions', href: '/inventory/stock-transactions' },
          { label: 'Stock Ledger',       href: '/inventory/ledger' },
          { label: 'Stock Balance',      href: '/inventory/stock-balance' },
          { label: 'Stock Planning',     href: '/inventory/stock-planning' },
          { label: 'Stock Aging',        href: '/inventory/stock-aging' },
          { label: 'Inventory Valuation',href: '/inventory/valuation' },
          { label: 'Inventory Turnover',  href: '/inventory/inventory-turnover' },
          { label: 'ABC Analysis',       href: '/inventory/abc-analysis' },
          { label: 'Slow Moving Items',  href: '/inventory/slow-moving' },
          
        ],
      },
    ],
  },
  {
    label: 'Manufacturing',
    groups: [
      {
        label: 'Setup',
        items: [
          { label: 'Work Centers',      href: '/manufacturing/work-centers' },
          { label: 'Bill of Materials', href: '/manufacturing/bom' },
        ],
      },
      {
        label: 'Production',
        items: [{ label: 'Production Orders', href: '/manufacturing/production-orders' }],
      },
    ],
  },
  {
    label: 'Sales',
    groups: [
      { label: 'Customers', items: [{ label: 'Customers', href: '/sales/customers' }] },
      { label: 'Orders',    items: [{ label: 'Sales Orders', href: '/sales/sales-orders' }, { label: 'AR Invoices', href: '/sales/invoices' }] },
    ],
  },
  {
    label: 'Financial',
    groups: [
      {
        label: 'Accounting',
        items: [
          { label: 'Chart of Accounts', href: '/accounting/chart-of-accounts' },
          { label: 'Journal Entries',   href: '/accounting/journal-entries' },
          { label: 'Fiscal Periods',    href: '/accounting/fiscal-periods' },
        ],
      },
      {
        label: 'Automation',
        items: [
          { label: 'JE Review Queue',   href: '/accounting/je-queue' },
          { label: 'Automation Config', href: '/accounting/automation' },
        ],
      },
      {
        label: 'Reports',
        items: [{ label: 'Financial Reports', href: '/accounting/reports' }],
      },
      {
        label: 'Planning',
        items: [
          { label: 'Budgets',   href: '/accounting/budgets' },
          { label: 'Cash Flow', href: '/accounting/cash-flow' },
        ],
      },
    ],
  },
  {
    label: 'Settings',
    groups: [
      {
        label: 'Configuration',
        items: [
          { label: 'General Settings',   href: '/settings/general' },
          { label: 'Units of Measure',   href: '/settings/uom' },
          { label: 'Fiscal Periods',     href: '/accounting/fiscal-periods' },
          { label: 'Automation Config',  href: '/accounting/automation' },
          { label: 'Bill of Materials',  href: '/manufacturing/bom' },
        ],
      },
      {
        label: 'Data Management',
        items: [
          { label: 'Bulk Import', href: '/settings/bulk-import' },
        ],
      },
      {
        label: 'Master Data',
        items: [
          { label: 'Items',              href: '/inventory/items' },
          { label: 'Macro Categories',   href: '/inventory/macro-categories' },
          { label: 'Categories',         href: '/inventory/categories' },
          { label: 'Consumption Groups', href: '/inventory/consumption-groups' },
          { label: 'Customers',          href: '/sales/customers' },
          { label: 'Suppliers',          href: '/procurement/suppliers' },
          { label: 'Warehouses',         href: '/inventory/warehouses' },
          { label: 'Work Centers',       href: '/manufacturing/work-centers' },
          { label: 'Chart of Accounts',  href: '/accounting/chart-of-accounts' },
        ],
      },
    ],
  },
];

// ─── Single nav item with dropdown ───────────────────────────────────────────

function NavDropdown({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [hoverGroup, setHoverGroup] = useState<string>('');
  const router = useRouter();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open_ = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    setHoverGroup(item.groups?.[0]?.label ?? '');
  };
  const close_ = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const currentGroup = item.groups?.find(g => g.label === hoverGroup);

  if (!item.groups) {
    return (
      <div className={`ni${isActive ? ' ni-active' : ''}`} onClick={() => router.push(item.href!)}>
        {item.label}
      </div>
    );
  }

  return (
    <div
      className={`ni ni-dd${isActive ? ' ni-active' : ''}${open ? ' ni-open' : ''}`}
      onMouseEnter={open_}
      onMouseLeave={close_}
    >
      {item.label}
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ display:'block', flexShrink:0 }}>
        <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>

      {open && (
        <div className="dd-panel" onMouseEnter={open_} onMouseLeave={close_}>
          <div className="dd-left">
            {item.groups.map(g => (
              <div
                key={g.label}
                className={`dd-group${hoverGroup === g.label ? ' dd-group-on' : ''}`}
                onMouseEnter={() => setHoverGroup(g.label)}
              >
                <span>{g.label}</span>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ display:'block', flexShrink:0 }}>
                  <path d="M3 1.5L6 4.5L3 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            ))}
          </div>

          {currentGroup && (
            <div className="dd-right">
              <div className="dd-right-hdr">{currentGroup.label}</div>
              {currentGroup.items.map(leaf => (
                <div
                  key={leaf.href}
                  className="dd-leaf"
                  onClick={() => { router.push(leaf.href); setOpen(false); }}
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display:'block', flexShrink:0, opacity:0.45 }}>
                    <rect x="1.5" y="2.5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
                    <line x1="3.5" y1="5.5" x2="9.5" y2="5.5" stroke="currentColor" strokeWidth="1"/>
                    <line x1="3.5" y1="7.8" x2="7.5" y2="7.8" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  {leaf.label}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

interface ERPShellProps {
  children: React.ReactNode;
  breadcrumbs?: string[];
  title?: string;
}

export default function ERPShell({ children, breadcrumbs, title }: ERPShellProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState('');

  const initials = (user?.name || user?.email || 'A').charAt(0).toUpperCase();

  const isActive = (item: NavItem) => {
    if (item.href) return pathname === item.href;
    // Settings only activates on /settings/* — never on cross-module links
    if (item.label === 'Settings') return pathname.startsWith('/settings');
    return item.groups?.some(g => g.items.some(i => pathname.startsWith(i.href))) ?? false;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300&family=IBM+Plex+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .shell-root {
          font-family: 'IBM Plex Sans', sans-serif;
          height: 100vh;
          background-color: #07050e;
          background-image:
            radial-gradient(ellipse 80% 40% at 50% 100%, rgba(234,88,12,0.16) 0%, transparent 60%),
            linear-gradient(to bottom, #0c0a1a 0%, #110c1c 50%, #18100a 100%);
          color: #e2dfd8;
          display: flex; flex-direction: column;
        }

        .shell-brand {
          height: 42px;
          background: rgba(8,6,14,0.97);
          border-bottom: 0.5px solid rgba(251,146,60,0.2);
          display: flex; align-items: center;
          padding: 0 18px; gap: 14px;
          position: sticky; top: 0; z-index: 200;
          backdrop-filter: blur(20px); flex-shrink: 0;
        }

        .shell-mark {
          width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
          background: linear-gradient(145deg,#c2410c,#ea580c,#f97316);
          box-shadow: 0 2px 10px rgba(234,88,12,0.38);
          display: flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .shell-mark svg { width: 14px; height: 14px; display: block; flex-shrink: 0; }

        .shell-wordmark {
          font-family: 'Cormorant Garamond', serif;
          font-size: 18px; font-weight: 300; letter-spacing: 0.1em;
          color: #fff; flex-shrink: 0; cursor: pointer; white-space: nowrap;
        }
        .shell-wordmark span { color: #fb923c; }

        .shell-search {
          flex: 1; max-width: 300px;
          background: rgba(255,255,255,0.05);
          border: 0.5px solid rgba(255,255,255,0.09);
          border-radius: 6px; padding: 4px 10px;
          font-size: 12px; font-family: 'IBM Plex Sans', sans-serif;
          color: #e2dfd8; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .shell-search::placeholder { color: rgba(255,255,255,0.22); }
        .shell-search:focus {
          border-color: rgba(251,146,60,0.4);
          box-shadow: 0 0 0 2px rgba(234,88,12,0.1);
        }

        .shell-user { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .shell-uname { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.75); }
        .shell-urole { font-size: 10px; color: rgba(255,255,255,0.3); }
        .shell-avatar {
          width: 26px; height: 26px; border-radius: 50%;
          background: linear-gradient(135deg,#c2410c,#f97316);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 500; color: #fff; flex-shrink: 0; cursor: pointer;
        }
        .shell-signout {
          font-size: 11px; color: rgba(251,146,60,0.5);
          background: none; border: none; cursor: pointer;
          font-family: 'IBM Plex Sans', sans-serif;
          padding: 3px 7px; border-radius: 4px;
          transition: color 0.2s, background 0.2s;
        }
        .shell-signout:hover { color: #fb923c; background: rgba(251,146,60,0.08); }

        .shell-nav {
          height: 34px;
          background: rgba(18,12,26,0.97);
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          display: flex; align-items: stretch;
          padding: 0 18px; gap: 0;
          overflow: visible; scrollbar-width: none;
          position: sticky; top: 42px; z-index: 199;
          backdrop-filter: blur(20px); flex-shrink: 0;
        }
        .shell-nav::-webkit-scrollbar { display: none; }

        .ni {
          display: flex; align-items: center; gap: 4px;
          padding: 0 11px; font-size: 12px;
          color: rgba(255,255,255,0.45);
          cursor: pointer; white-space: nowrap;
          border-bottom: 2px solid transparent;
          transition: color 0.15s, background 0.15s, border-color 0.15s;
          user-select: none; position: relative;
        }
        .ni:hover, .ni-open { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.04); }
        .ni-active { color: #fb923c !important; border-bottom-color: #fb923c !important; background: rgba(251,146,60,0.05) !important; }

        .ni-dd::after {
          content: "";
          position: absolute;
          top: 100%; left: 0;
          width: 100%; height: 8px;
          background: transparent;
        }

        .dd-panel {
          position: absolute;
          top: 100%; left: 0;
          margin-top: 2px;
          min-width: 380px;
          background: rgba(12,8,22,0.98);
          border: 0.5px solid rgba(251,146,60,0.2);
          border-radius: 10px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.02) inset;
          backdrop-filter: blur(24px);
          display: flex;
          z-index: 300;
          animation: dd-appear 0.1s ease;
        }
        @keyframes dd-appear {
          from { opacity: 0; transform: translateY(-3px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .dd-left {
          width: 150px; flex-shrink: 0;
          background: rgba(255,255,255,0.02);
          border-right: 0.5px solid rgba(255,255,255,0.06);
          border-radius: 10px 0 0 10px;
          padding: 6px; display: flex; flex-direction: column; gap: 1px;
        }
        .dd-group {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 10px; border-radius: 6px;
          font-size: 12px; font-weight: 500;
          color: rgba(255,255,255,0.45); cursor: pointer;
          transition: background 0.1s, color 0.1s;
        }
        .dd-group:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.75); }
        .dd-group-on {
          background: rgba(251,146,60,0.1) !important;
          color: #fb923c !important;
          border: 0.5px solid rgba(251,146,60,0.22);
        }

        .dd-right {
          flex: 1; padding: 8px 8px 8px 6px;
          display: flex; flex-direction: column; gap: 1px;
          min-width: 200px;
          border-radius: 0 10px 10px 0;
        }
        .dd-right-hdr {
          font-size: 10px; font-weight: 500;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(251,146,60,0.5);
          padding: 4px 10px 8px;
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          margin-bottom: 3px;
        }
        .dd-leaf {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 6px;
          font-size: 12px; color: rgba(255,255,255,0.6);
          cursor: pointer; transition: background 0.1s, color 0.1s;
        }
        .dd-leaf:hover { background: rgba(255,255,255,0.06); color: #f1ede8; }

        .shell-sub { display: flex; align-items: center; padding: 10px 18px 6px; flex-shrink: 0; }
        .shell-bc  { display: flex; align-items: center; gap: 5px; font-size: 12px; color: rgba(255,255,255,0.3); }
        .shell-bc-sep  { color: rgba(255,255,255,0.15); }
        .shell-bc-link { color: rgba(251,146,60,0.55); cursor: pointer; transition: color 0.15s; }
        .shell-bc-link:hover { color: #fb923c; }
        .shell-bc-cur  { color: rgba(255,255,255,0.6); }

        .shell-title { font-size: 15px; font-weight: 500; color: #f1ede8; padding: 0 18px 8px; }
        .shell-content { flex: 1; overflow: hidden; min-height: 0; }
      `}</style>

      <div className="shell-root">
        <div className="shell-brand">
          <div className="shell-mark" onClick={() => router.push('/')}>
            <svg viewBox="0 0 26 26" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13" cy="11" r="4"/>
              <line x1="13" y1="3"   x2="13"   y2="5.5"/>
              <line x1="19.5" y1="6.5" x2="18.2" y2="7.8"/>
              <line x1="22"  y1="13"  x2="19.8" y2="13"/>
              <line x1="6.5" y1="6.5" x2="7.8"  y2="7.8"/>
              <line x1="4"   y1="13"  x2="6.2"  y2="13"/>
              <line x1="4"   y1="19"  x2="22"   y2="19" strokeWidth="2.2"/>
            </svg>
          </div>
          <span className="shell-wordmark" onClick={() => router.push('/')}>Sun<span>set</span></span>
          <input
            className="shell-search"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="shell-user">
            <div>
              <div className="shell-uname">{user?.name || user?.email || 'Admin'}</div>
              <div className="shell-urole">Administrator · Executive</div>
            </div>
            <div className="shell-avatar">{initials}</div>
            <button className="shell-signout" onClick={logout}>Sign out</button>
          </div>
        </div>

        <div className="shell-nav">
          {NAV.map(item => (
            <NavDropdown key={item.label} item={item} isActive={isActive(item)} />
          ))}
        </div>

        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="shell-sub">
            <div className="shell-bc">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  {i > 0 && <span className="shell-bc-sep">›</span>}
                  {i < breadcrumbs.length - 1
                    ? <span className="shell-bc-link">{crumb}</span>
                    : <span className="shell-bc-cur">{crumb}</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {title && <div className="shell-title">{title}</div>}
        <div className="shell-content">{children}</div>
      </div>
    </>
  );
}
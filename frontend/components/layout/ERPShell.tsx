"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

// ─── Permission-aware nav structure ──────────────────────────────────────────

interface NavLeaf  { label: string; href: string; permission?: string; }
interface NavGroup { label: string; items: NavLeaf[]; permission?: string; }
interface NavItem  { label: string; href?: string; groups?: NavGroup[]; permission?: string; }

const NAV: NavItem[] = [
  { label: 'Home', href: '/' },
  {
    label: 'Procurement', permission: 'PROCUREMENT:VIEW',
    groups: [
      { label: 'Suppliers', items: [
        { label: 'Supplier Catalog',       href: '/procurement/suppliers',      permission: 'PROCUREMENT:VIEW' },
        { label: 'Supplier Items Catalog', href: '/procurement/supplier-items', permission: 'PROCUREMENT:VIEW' },
      ]},
      { label: 'Planning', items: [
        { label: 'Purchase Requisitions', href: '/procurement/purchase-requisitions', permission: 'PROCUREMENT:VIEW' },
        { label: 'General Needs',         href: '/procurement/general-needs',          permission: 'PROCUREMENT:VIEW' },
        { label: 'RFQs',                  href: '/procurement/rfqs',                  permission: 'PROCUREMENT:VIEW' },
      ]},
      { label: 'Purchasing', items: [
        { label: 'Purchase Orders', href: '/procurement/purchase-orders', permission: 'PROCUREMENT:VIEW' },
        { label: 'Goods Receipts',  href: '/procurement/goods-receipts',  permission: 'PROCUREMENT:VIEW' },
        { label: 'AP Invoices',     href: '/procurement/ap-invoices',     permission: 'AP:VIEW' },
      ]},
    ],
  },
  {
    label: 'Inventory', permission: 'INVENTORY:VIEW',
    groups: [
      { label: 'Catalog', items: [
        { label: 'Items',              href: '/inventory/items',              permission: 'INVENTORY:VIEW' },
        { label: 'Warehouses',         href: '/inventory/warehouses',         permission: 'INVENTORY:VIEW' },
        { label: 'Macro Categories',   href: '/inventory/macro-categories',   permission: 'INVENTORY:VIEW' },
        { label: 'Categories',         href: '/inventory/categories',         permission: 'INVENTORY:VIEW' },
        { label: 'Consumption Groups', href: '/inventory/consumption-groups', permission: 'INVENTORY:VIEW' },
      ]},
      { label: 'Stock Control', items: [
        { label: 'Stock Transactions',   href: '/inventory/stock-transactions',  permission: 'INVENTORY:VIEW'  },
        { label: 'Stock Balance',        href: '/inventory/stock-balance',        permission: 'INVENTORY:VIEW'  },
        { label: 'Stock Ledger',         href: '/inventory/ledger',              permission: 'INVENTORY:VIEW'  },
        { label: 'Stock Reconciliation', href: '/inventory/stock-reconciliation', permission: 'INVENTORY:COUNT'},
        { label: 'Label Printing',       href: '/inventory/labels',              permission: 'INVENTORY:VIEW'  },
      ]},
      { label: 'Analysis', items: [
        { label: 'Stock Planning',      href: '/inventory/stock-planning',     permission: 'INVENTORY:VIEW' },
        { label: 'Stock Aging',         href: '/inventory/stock-aging',        permission: 'INVENTORY:VIEW' },
        { label: 'Inventory Valuation', href: '/inventory/valuation',          permission: 'INVENTORY:VIEW' },
        { label: 'Inventory Turnover',  href: '/inventory/inventory-turnover', permission: 'INVENTORY:VIEW' },
        { label: 'ABC Analysis',        href: '/inventory/abc-analysis',       permission: 'INVENTORY:VIEW' },
        { label: 'Slow Moving Items',   href: '/inventory/slow-moving',        permission: 'INVENTORY:VIEW' },
      ]},
    ],
  },
  {
    label: 'Manufacturing', permission: 'MFG:VIEW',
    groups: [
      { label: 'Engineering', items: [
        { label: 'Bill of Materials', href: '/manufacturing/boms',         permission: 'MFG:VIEW' },
        { label: 'Work Centers',      href: '/manufacturing/work-centers', permission: 'MFG:VIEW' },
      ]},
      { label: 'Production', items: [
        { label: 'Production Plans',  href: '/manufacturing/production-plans',  permission: 'MFG:VIEW' },
        { label: 'Production Orders', href: '/manufacturing/production-orders', permission: 'MFG:VIEW' },
      ]},
    ],
  },
  {
    label: 'Sales', permission: 'SALES:VIEW',
    groups: [
      { label: 'Customers', items: [
        { label: 'Customer Catalog', href: '/sales/customers', permission: 'SALES:VIEW' },
      ]},
      { label: 'Orders & Billing', items: [
        { label: 'Sales Orders', href: '/sales/sales-orders', permission: 'SALES:VIEW' },
        { label: 'AR Invoices',  href: '/sales/invoices',     permission: 'AR:VIEW'    },
      ]},
    ],
  },
  {
    label: 'Financial', permission: 'ACCOUNTING:VIEW',
    groups: [
      { label: 'General Ledger', items: [
        { label: 'Chart of Accounts', href: '/accounting/chart-of-accounts', permission: 'ACCOUNTING:VIEW' },
        { label: 'Journal Entries',   href: '/accounting/journal-entries',   permission: 'ACCOUNTING:VIEW' },
        { label: 'Fiscal Periods',    href: '/accounting/fiscal-periods',    permission: 'ACCOUNTING:VIEW' },
      ]},
      { label: 'Automation', items: [
        { label: 'JE Review Queue',   href: '/accounting/je-queue',  permission: 'ACCOUNTING:VIEW' },
        { label: 'Automation Config', href: '/accounting/automation', permission: 'ADMIN:SETTINGS'  },
      ]},
      { label: 'Reports', items: [
        { label: 'Financial Reports', href: '/accounting/reports', permission: 'ACCOUNTING:VIEW' },
      ]},
      { label: 'Planning', items: [
        { label: 'Budgets',   href: '/accounting/budgets',   permission: 'ACCOUNTING:VIEW' },
        { label: 'Cash Flow', href: '/accounting/cash-flow', permission: 'ACCOUNTING:VIEW' },
      ]},
    ],
  },
  {
    label: 'Settings', permission: 'ADMIN:SETTINGS',
    groups: [
      { label: 'Access Control', items: [
        { label: 'Tenants',             href: '/settings/tenants', permission: 'ADMIN:SETTINGS' },
        { label: 'Users',               href: '/settings/users',   permission: 'ADMIN:SETTINGS' },
        { label: 'Roles & Permissions', href: '/settings/roles',   permission: 'ADMIN:SETTINGS' },
      ]},
      { label: 'System Config', items: [
        { label: 'General Settings', href: '/settings/general',          permission: 'ADMIN:SETTINGS' },
        { label: 'Units of Measure', href: '/settings/uom',              permission: 'ADMIN:SETTINGS' },
        { label: 'Notifications',    href: '/settings/notifications',    permission: 'SETTINGS:VIEW' },
        { label: 'Fiscal Calendar',  href: '/accounting/fiscal-periods', permission: 'ADMIN:SETTINGS' },
        { label: 'JE Automation',    href: '/accounting/automation',      permission: 'ADMIN:SETTINGS' },
      ]},
      { label: 'Data Management', items: [
        { label: 'Bulk Import & Export', href: '/settings/bulk-import', permission: 'ADMIN:SETTINGS' },
      ]},
      { label: 'Master Data', items: [
        { label: 'Items',             href: '/inventory/items',              permission: 'INVENTORY:VIEW'  },
        { label: 'Warehouses',        href: '/inventory/warehouses',         permission: 'INVENTORY:VIEW'  },
        { label: 'Categories',        href: '/inventory/categories',         permission: 'INVENTORY:VIEW'  },
        { label: 'Suppliers',         href: '/procurement/suppliers',        permission: 'PROCUREMENT:VIEW'},
        { label: 'Customers',         href: '/sales/customers',              permission: 'SALES:VIEW'      },
        { label: 'Work Centers',      href: '/manufacturing/work-centers',   permission: 'MFG:VIEW'        },
        { label: 'Chart of Accounts', href: '/accounting/chart-of-accounts', permission: 'ACCOUNTING:VIEW' },
      ]},
    ],
  },
];

// ─── Module icons map ─────────────────────────────────────────────────────────

const MODULE_ICONS: Record<string, string> = {
  'Procurement': '📦', 'Inventory': '🏭', 'Manufacturing': '⚙️',
  'Sales': '💼', 'Financial': '📊', 'Settings': '🔧', 'Home': '🏠',
};

const GROUP_ICONS: Record<string, string> = {
  'Suppliers': '🤝', 'Planning': '📋', 'Purchasing': '🛒',
  'Catalog': '📚', 'Stock Control': '📦', 'Analysis': '📈',
  'Engineering': '🔩', 'Production': '🏗️', 'Customers': '👥',
  'Orders & Billing': '🧾', 'General Ledger': '📒', 'Automation': '⚡',
  'Reports': '📊', 'Access Control': '🔐', 'System Config': '⚙️',
  'Data Management': '💾', 'Master Data': '🗂️',
};

// ─── Flat list of all pages for palette search ────────────────────────────────

interface PaletteItem {
  label:    string;
  href:     string;
  group:    string;
  module:   string;
  keywords: string;
}

function buildPaletteItems(hasPermission: (p?: string) => boolean): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const nav of NAV) {
    if (!hasPermission(nav.permission)) continue;
    if (nav.href) {
      items.push({ label: nav.label, href: nav.href, group: '', module: nav.label, keywords: nav.label.toLowerCase() });
    }
    for (const group of nav.groups ?? []) {
      for (const leaf of group.items) {
        if (!hasPermission(leaf.permission)) continue;
        items.push({
          label:    leaf.label,
          href:     leaf.href,
          group:    group.label,
          module:   nav.label,
          keywords: `${leaf.label} ${group.label} ${nav.label}`.toLowerCase(),
        });
      }
    }
  }
  return items;
}

// ─── Command Palette ──────────────────────────────────────────────────────────

function CommandPalette({ open, onClose, hasPermission }: {
  open: boolean;
  onClose: () => void;
  hasPermission: (p?: string) => boolean;
}) {
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState(0);
  const router  = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = useMemo(() => buildPaletteItems(hasPermission), [hasPermission]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // Show recent/popular pages when empty
      return allItems.slice(0, 8);
    }
    const q = query.toLowerCase();
    return allItems
      .filter(it => it.keywords.includes(q))
      .slice(0, 10);
  }, [query, allItems]);

  // Group results by module
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of results) {
      if (!map.has(item.module)) map.set(item.module, []);
      map.get(item.module)!.push(item);
    }
    return map;
  }, [results]);

  // Flat index for keyboard nav
  const flat = useMemo(() => results, [results]);

  useEffect(() => {
    if (open) {
      setQuery(''); setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && flat[selected]) { navigate(flat[selected].href); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, flat, selected, navigate, onClose]);

  if (!open) return null;

  let flatIdx = 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>

      <div style={{ width: 560, background: '#0c0a18', border: '0.5px solid rgba(251,146,60,0.3)', borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02) inset', overflow: 'hidden', animation: 'palette-in 0.15s ease' }}>
        <style>{`
          @keyframes palette-in {
            from { opacity:0; transform: scale(0.97) translateY(-8px); }
            to   { opacity:1; transform: scale(1)    translateY(0); }
          }
        `}</style>

        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'rgba(251,146,60,0.5)' }}>
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages, modules…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#f1ede8', fontFamily: "'IBM Plex Sans',sans-serif" }}
          />
          <kbd style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 400, overflowY: 'auto', padding: '6px 8px 8px' }}>
          {results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 20px', fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
              No pages found for "{query}"
            </div>
          ) : (
            Array.from(grouped.entries()).map(([module, items]) => (
              <div key={module}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(251,146,60,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 8px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{MODULE_ICONS[module] ?? '📄'}</span>
                  {module}
                </div>
                {items.map(item => {
                  const idx = flat.indexOf(item);
                  const isSelected = idx === selected;
                  flatIdx++;
                  return (
                    <div key={item.href}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setSelected(idx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: isSelected ? 'rgba(251,146,60,0.1)' : 'transparent', border: `0.5px solid ${isSelected ? 'rgba(251,146,60,0.2)' : 'transparent'}`, transition: 'all 0.08s', marginBottom: 2 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: isSelected ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                        {GROUP_ICONS[item.group] ?? '📄'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: isSelected ? '#fb923c' : '#e2dfd8', fontWeight: isSelected ? 500 : 400 }}>{item.label}</div>
                        {item.group && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{item.group}</div>}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                        {item.href}
                      </div>
                      {isSelected && (
                        <kbd style={{ fontSize: 10, color: 'rgba(251,146,60,0.6)', background: 'rgba(251,146,60,0.08)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace', flexShrink: 0 }}>↵</kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div style={{ padding: '8px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 16, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
          <span><kbd style={{ fontFamily: 'monospace', marginRight: 4 }}>↑↓</kbd>navigate</span>
          <span><kbd style={{ fontFamily: 'monospace', marginRight: 4 }}>↵</kbd>go</span>
          <span><kbd style={{ fontFamily: 'monospace', marginRight: 4 }}>ESC</kbd>close</span>
          <span style={{ marginLeft: 'auto' }}>
            <kbd style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 5px', marginRight: 4 }}>Ctrl</kbd>
            <kbd style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 5px' }}>K</kbd>
            to open
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Permission helper ────────────────────────────────────────────────────────

function useHasPermission() {
  const { user } = useAuth();
  return (permission?: string): boolean => {
    if (!permission) return true;
    if (!user) return false;
    if ((user.role ?? '').toUpperCase() === 'ADMIN') return true;
    const perms: string[] = (user as any).permissions ?? [];
    return perms.includes(permission);
  };
}

// ─── Nav dropdown component ───────────────────────────────────────────────────

function NavDropdown({ item, isActive, hasPermission }: {
  item: NavItem; isActive: boolean; hasPermission: (p?: string) => boolean;
}) {
  const [open,       setOpen]       = useState(false);
  const [hoverGroup, setHoverGroup] = useState<string>('');
  const router     = useRouter();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const clearClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };

  const openMenu = () => {
    clearClose();
    const firstGroup = item.groups?.find(g => g.items.some(i => hasPermission(i.permission)));
    setOpen(true);
    setHoverGroup(prev => prev || (firstGroup?.label ?? item.groups?.[0]?.label ?? ''));
  };

  // 350ms grace period — lets user move diagonally from trigger to panel
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = setTimeout(() => setOpen(false), 350);
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    if (wrapperRef.current && !wrapperRef.current.contains(e.relatedTarget as Node)) {
      scheduleClose();
    }
  };

  const currentGroup  = item.groups?.find(g => g.label === hoverGroup);
  const visibleLeaves = currentGroup?.items.filter(i => hasPermission(i.permission)) ?? [];
  const visibleGroups = item.groups?.filter(g => g.items.some(i => hasPermission(i.permission))) ?? [];

  if (!item.groups) {
    return (
      <div className={`ni${isActive ? ' ni-active' : ''}`} onClick={() => router.push(item.href!)}>
        {item.label}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={`ni ni-dd${isActive ? ' ni-active' : ''}${open ? ' ni-open' : ''}`}
      onPointerEnter={openMenu}
      onPointerLeave={handlePointerLeave}
      style={{ position: 'relative' }}
    >
      {item.label}
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ display:'block', flexShrink:0 }}>
        <path d="M1.5 3L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>

      {open && visibleGroups.length > 0 && (
        <>
          {/* Invisible bridge — covers gap between nav bottom and panel top */}
          <div
            style={{ position: 'absolute', top: '100%', left: -10, right: -10, height: 14, background: 'transparent', zIndex: 299 }}
            onPointerEnter={clearClose}
          />
          <div className="dd-panel">
            <div className="dd-left">
              {visibleGroups.map(g => (
                <div key={g.label}
                  className={`dd-group${hoverGroup === g.label ? ' dd-group-on' : ''}`}
                  onPointerEnter={() => { clearClose(); setHoverGroup(g.label); }}>
                  <span>{g.label}</span>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ display:'block', flexShrink:0 }}>
                    <path d="M3 1.5L6 4.5L3 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              ))}
            </div>
            {visibleLeaves.length > 0 && (
              <div className="dd-right">
                <div className="dd-right-hdr">{currentGroup?.label}</div>
                {visibleLeaves.map(leaf => (
                  <div key={leaf.href} className="dd-leaf"
                    onClick={() => { router.push(leaf.href); setOpen(false); }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display:'block', flexShrink:0, opacity:0.4 }}>
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
        </>
      )}
    </div>
  );
}
// ─── Shell wrapper ────────────────────────────────────────────────────────────

interface ERPShellProps { children: React.ReactNode; breadcrumbs?: string[]; title?: string; }

export default function ERPShell({ children, breadcrumbs, title }: ERPShellProps) {
  const { user, tenantName, logout } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const hasPermission = useHasPermission();

  const fullName  = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const initials  = fullName ? fullName.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() ?? 'A');
  const roleLabel = user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase().replace(/_/g, ' ') : '';

  const isActive = (item: NavItem) => {
    if (item.href) return pathname === item.href;
    if (item.label === 'Settings') return pathname.startsWith('/settings');
    return item.groups?.some(g => g.items.some(i => pathname.startsWith(i.href))) ?? false;
  };

  const visibleNav = NAV.filter(item => hasPermission(item.permission));

  // Global Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

        /* ── Command palette trigger button ── */
        .shell-search-btn {
          flex: 1; max-width: 300px;
          background: rgba(255,255,255,0.05);
          border: 0.5px solid rgba(255,255,255,0.09);
          border-radius: 6px; padding: 5px 10px;
          font-size: 12px; font-family: 'IBM Plex Sans', sans-serif;
          color: rgba(255,255,255,0.3); cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          display: flex; align-items: center; gap: 8px; text-align: left;
        }
        .shell-search-btn:hover {
          border-color: rgba(251,146,60,0.3);
          background: rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.5);
        }
        .shell-search-btn svg { flex-shrink: 0; opacity: 0.4; }
        .shell-search-btn-kbd {
          margin-left: auto;
          display: flex; align-items: center; gap: 3px;
        }
        .shell-search-btn-kbd kbd {
          font-size: 9px; color: rgba(255,255,255,0.2);
          background: rgba(255,255,255,0.06);
          border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 3px; padding: 1px 4px;
          font-family: monospace; line-height: 1.4;
        }

        .shell-user {
          margin-left: auto;
          display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        .shell-tenant {
          font-size: 10px; font-weight: 600; letter-spacing: 0.09em;
          text-transform: uppercase; color: rgba(251,146,60,0.5);
          padding-right: 12px;
          border-right: 0.5px solid rgba(255,255,255,0.08);
          white-space: nowrap;
        }
        .shell-uname { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.75); white-space: nowrap; }
        .shell-urole { font-size: 10px; color: rgba(255,255,255,0.3); }
        .shell-avatar {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg,#c2410c,#f97316);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600; color: #fff; cursor: pointer;
        }
        .shell-signout {
          font-size: 11px; color: rgba(251,146,60,0.5);
          background: none; border: none; cursor: pointer;
          font-family: 'IBM Plex Sans', sans-serif;
          padding: 3px 7px; border-radius: 4px;
          transition: color 0.2s, background 0.2s; white-space: nowrap;
        }
        .shell-signout:hover { color: #fb923c; background: rgba(251,146,60,0.08); }

        .shell-nav {
          height: 34px;
          background: rgba(18,12,26,0.97);
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          display: flex; align-items: stretch;
          padding: 0 18px; overflow: visible;
          position: sticky; top: 42px; z-index: 199;
          backdrop-filter: blur(20px); flex-shrink: 0;
        }

        .ni {
          display: flex; align-items: center; gap: 4px;
          padding: 0 11px; font-size: 12px;
          color: rgba(255,255,255,0.45); cursor: pointer; white-space: nowrap;
          border-bottom: 2px solid transparent;
          transition: color 0.15s, background 0.15s, border-color 0.15s;
          user-select: none; position: relative;
        }
        .ni:hover, .ni-open { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.04); }
        .ni-active { color: #fb923c !important; border-bottom-color: #fb923c !important; background: rgba(251,146,60,0.05) !important; }
        /* bridge div handles gap — no ::after needed */

        .dd-panel {
          position: absolute; top: 100%; left: 0; margin-top: 2px; min-width: 380px;
          background: rgba(12,8,22,0.98);
          border: 0.5px solid rgba(251,146,60,0.2);
          border-radius: 10px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.02) inset;
          backdrop-filter: blur(24px); display: flex; z-index: 300;
          animation: dd-appear 0.1s ease;
        }
        @keyframes dd-appear {
          from { opacity:0; transform:translateY(-3px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .dd-left {
          width: 155px; flex-shrink: 0;
          background: rgba(255,255,255,0.02);
          border-right: 0.5px solid rgba(255,255,255,0.06);
          border-radius: 10px 0 0 10px;
          padding: 6px; display: flex; flex-direction: column; gap: 1px;
        }
        .dd-group {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 10px; border-radius: 6px; font-size: 12px; font-weight: 500;
          color: rgba(255,255,255,0.45); cursor: pointer;
          transition: background 0.1s, color 0.1s;
        }
        .dd-group:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.75); }
        .dd-group-on { background: rgba(251,146,60,0.1) !important; color: #fb923c !important; border: 0.5px solid rgba(251,146,60,0.22); }
        .dd-right { flex: 1; padding: 8px 8px 8px 6px; display: flex; flex-direction: column; gap: 1px; min-width: 200px; border-radius: 0 10px 10px 0; }
        .dd-right-hdr { font-size: 10px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(251,146,60,0.5); padding: 4px 10px 8px; border-bottom: 0.5px solid rgba(255,255,255,0.06); margin-bottom: 3px; }
        .dd-leaf { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 6px; font-size: 12px; color: rgba(255,255,255,0.6); cursor: pointer; transition: background 0.1s, color 0.1s; }
        .dd-leaf:hover { background: rgba(255,255,255,0.06); color: #f1ede8; }

        .shell-sub { display: flex; align-items: center; padding: 10px 18px 6px; flex-shrink: 0; }
        .shell-bc  { display: flex; align-items: center; gap: 5px; font-size: 12px; color: rgba(255,255,255,0.3); }
        .shell-bc-sep  { color: rgba(255,255,255,0.15); }
        .shell-bc-link { color: rgba(251,146,60,0.55); cursor: pointer; transition: color 0.15s; }
        .shell-bc-link:hover { color: #fb923c; }
        .shell-bc-cur  { color: rgba(255,255,255,0.6); }
        .shell-title   { font-size: 15px; font-weight: 500; color: #f1ede8; padding: 0 18px 8px; }
        .shell-content { flex: 1; overflow: hidden; min-height: 0; }
      `}</style>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} hasPermission={hasPermission} />

      <div className="shell-root">
        {/* ── Top bar ── */}
        <div className="shell-brand">
          <div className="shell-mark" onClick={() => router.push('/')}>
            <svg viewBox="0 0 26 26" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="13" cy="11" r="4"/>
              <line x1="13" y1="3" x2="13" y2="5.5"/>
              <line x1="19.5" y1="6.5" x2="18.2" y2="7.8"/>
              <line x1="22" y1="13" x2="19.8" y2="13"/>
              <line x1="6.5" y1="6.5" x2="7.8" y2="7.8"/>
              <line x1="4" y1="13" x2="6.2" y2="13"/>
              <line x1="4" y1="19" x2="22" y2="19" strokeWidth="2.2"/>
            </svg>
          </div>
          <span className="shell-wordmark" onClick={() => router.push('/')}>Sun<span>set</span></span>

          {/* Command palette trigger */}
          <button className="shell-search-btn" onClick={() => setPaletteOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3"/>
              <line x1="9" y1="9" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Search pages…
            <span className="shell-search-btn-kbd">
              <kbd>Ctrl</kbd><kbd>K</kbd>
            </span>
          </button>

          <div className="shell-user">
            {tenantName && <span className="shell-tenant">{tenantName}</span>}
            <div>
              <div className="shell-uname">{fullName || user?.email || 'Admin'}</div>
              {roleLabel && <div className="shell-urole">{roleLabel}</div>}
            </div>
            <div className="shell-avatar">{initials}</div>
            <button className="shell-signout" onClick={logout}>Sign out</button>
          </div>
        </div>

        {/* ── Nav bar ── */}
        <div className="shell-nav">
          {visibleNav.map(item => (
            <NavDropdown key={item.label} item={item} isActive={isActive(item)} hasPermission={hasPermission} />
          ))}
        </div>

        {/* ── Breadcrumb ── */}
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
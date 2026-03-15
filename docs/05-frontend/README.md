# FRONTEND DOCUMENTATION - SUNSET ERP

**Phase:** 2 - Architecture & Design  
**Section:** 05-frontend  
**Status:** In Progress  
**Date:** March 15, 2026

---

## OVERVIEW

Frontend architecture, design system, component library, and UI/UX specifications for Sunset ERP web application.

**Technology Stack:**
- **Framework:** React 18+
- **Build Tool:** Vite 5+
- **Language:** TypeScript 5+
- **Styling:** Tailwind CSS 3+
- **State Management:** React Query + Zustand
- **Routing:** React Router 6+
- **Forms:** React Hook Form + Zod validation

---

## DOCUMENTS IN THIS SECTION

### 1. [Design System](./design-system.md)
Colors, typography, spacing, and visual language.

### 2. [Component Library](./component-library.md)
Reusable UI components with examples.

### 3. [Page Layouts](./page-layouts.md)
Standard page templates and navigation structure.

### 4. [State Management](./state-management.md)
Client-side state strategy and data flow.

### 5. [Routing & Navigation](./routing-navigation.md)
Route structure and navigation patterns.

---

## DESIGN PRINCIPLES

### 1. Responsive First
- Mobile: 320px - 768px
- Tablet: 769px - 1024px
- Desktop: 1025px+

### 2. Accessibility (WCAG 2.1 AA)
- Keyboard navigation
- Screen reader support
- Color contrast ratios
- ARIA labels

### 3. Performance
- Code splitting by route
- Lazy loading components
- Image optimization
- Bundle size < 500KB

### 4. Multi-Tenant UI
- Tenant branding (logo, colors)
- Tenant switching
- Tenant-specific features

---

## COLOR PALETTE

### Primary Colors
```css
--primary-50:  #f0f9ff;
--primary-100: #e0f2fe;
--primary-500: #0ea5e9;  /* Main brand color */
--primary-600: #0284c7;
--primary-900: #0c4a6e;
```

### Semantic Colors
```css
--success: #10b981;
--warning: #f59e0b;
--error:   #ef4444;
--info:    #3b82f6;
```

### Neutral Colors
```css
--gray-50:  #f9fafb;
--gray-100: #f3f4f6;
--gray-500: #6b7280;
--gray-900: #111827;
```

---

## TYPOGRAPHY

### Font Family
```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', monospace;
```

### Type Scale
```css
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-3xl:  1.875rem;  /* 30px */
--text-4xl:  2.25rem;   /* 36px */
```

---

## SPACING SCALE

```css
--space-1:  0.25rem;  /* 4px */
--space-2:  0.5rem;   /* 8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
```

---

## CORE COMPONENTS

### Navigation
- TopBar (tenant selector, user menu, notifications)
- Sidebar (module navigation, collapsible)
- Breadcrumbs (current location)

### Forms
- Input (text, number, date)
- Select (dropdown, autocomplete)
- Checkbox / Radio
- File Upload
- Form validation with inline errors

### Data Display
- Table (sortable, filterable, paginated)
- Card (content container)
- Badge (status indicators)
- Avatar (user profile)

### Feedback
- Toast (notifications)
- Modal (dialogs)
- Loading Spinner
- Progress Bar
- Empty State

### Buttons
- Primary (main actions)
- Secondary (alternate actions)
- Tertiary (subtle actions)
- Danger (destructive actions)

---

## PAGE STRUCTURE

### Standard Layout
```
┌─────────────────────────────────────────┐
│ TopBar (Logo | Tenant | User Menu)     │
├─────┬───────────────────────────────────┤
│     │                                   │
│ S   │ Page Header (Title | Actions)    │
│ i   ├───────────────────────────────────┤
│ d   │                                   │
│ e   │                                   │
│ b   │  Main Content Area                │
│ a   │                                   │
│ r   │                                   │
│     │                                   │
└─────┴───────────────────────────────────┘
```

### Module Pages
1. **Dashboard** - KPIs, charts, recent activity
2. **List View** - Table with filters, search, pagination
3. **Detail View** - Record details with tabs
4. **Form View** - Create/edit forms
5. **Settings** - Configuration pages

---

## ROUTING STRUCTURE

```
/                          → Dashboard
/login                     → Login page
/register                  → Registration
/select-tenant             → Tenant selection

/procurement/
  /suppliers               → Supplier list
  /suppliers/:id           → Supplier detail
  /suppliers/new           → Create supplier
  /purchase-orders         → PO list
  /purchase-orders/:id     → PO detail
  /purchase-orders/new     → Create PO

/inventory/
  /items                   → Item list
  /items/:id               → Item detail
  /stock                   → Stock levels
  /movements               → Stock movements

/sales/
  /customers               → Customer list
  /orders                  → Sales order list
  /orders/:id              → Order detail

/accounting/
  /accounts                → Chart of accounts
  /journal-entries         → Journal entries
  /reports                 → Financial reports

/settings/
  /profile                 → User profile
  /company                 → Company settings
  /users                   → User management
  /roles                   → Role management
```

---

## STATE MANAGEMENT STRATEGY

### React Query (Server State)
- API data fetching
- Caching and invalidation
- Optimistic updates

```typescript
// Example: Fetch suppliers
const { data, isLoading } = useQuery({
  queryKey: ['suppliers', tenantId],
  queryFn: () => api.suppliers.list()
});
```

### Zustand (Client State)
- UI state (sidebar open/closed)
- User preferences
- Temporary form state

```typescript
// Example: UI store
const useUIStore = create((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ 
    sidebarOpen: !state.sidebarOpen 
  }))
}));
```

### Local State (Component)
- Form inputs
- Toggle states
- Component-specific UI

---

## FORM PATTERNS

### Create/Edit Pattern
```typescript
// 1. Define schema
const supplierSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  email: z.string().email().optional()
});

// 2. Use in form
const form = useForm({
  resolver: zodResolver(supplierSchema)
});

// 3. Submit with optimistic update
const mutation = useMutation({
  mutationFn: api.suppliers.create,
  onSuccess: () => {
    queryClient.invalidateQueries(['suppliers']);
    navigate('/procurement/suppliers');
  }
});
```

---

## ERROR HANDLING

### Display Errors
- Toast for success/error messages
- Inline validation errors in forms
- Error boundaries for component crashes
- 404 page for not found
- 500 page for server errors

### Network Errors
```typescript
// Automatic retry with React Query
useQuery({
  queryKey: ['suppliers'],
  queryFn: api.suppliers.list,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
});
```

---

## PERFORMANCE OPTIMIZATION

### Code Splitting
```typescript
// Lazy load routes
const ProcurementModule = lazy(() => import('./modules/procurement'));
const InventoryModule = lazy(() => import('./modules/inventory'));
```

### Image Optimization
- Use WebP format
- Lazy load images
- Responsive images with srcset

### Bundle Size
- Tree shaking enabled
- Remove unused dependencies
- Analyze bundle with `vite-bundle-visualizer`

---

## TESTING STRATEGY

### Unit Tests (Vitest)
- Component logic
- Utility functions
- Custom hooks

### Integration Tests (React Testing Library)
- User interactions
- Form submissions
- Navigation flows

### E2E Tests (Playwright)
- Critical user journeys
- Multi-tenant scenarios
- Cross-browser testing

---

## ACCESSIBILITY CHECKLIST

- [ ] All interactive elements keyboard accessible
- [ ] Form inputs have labels
- [ ] Images have alt text
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible
- [ ] ARIA labels for screen readers
- [ ] Error messages announced
- [ ] Skip navigation link

---

## BROWSER SUPPORT

### Target Browsers
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Mobile Browsers
- iOS Safari 14+
- Chrome Mobile 90+

---

## DEVELOPMENT WORKFLOW

### Local Development
```bash
npm run dev              # Start dev server
npm run build           # Production build
npm run preview         # Preview build
npm run test           # Run tests
npm run lint           # ESLint check
```

### Component Development
- Use Storybook for isolated component development
- Document component props
- Include usage examples

---

**Status:** 5 documents to create  
**Priority:** HIGH - Implementation dependency  
**Owner:** Frontend Team
# SUNSET ERP - FRONTEND DEVELOPMENT SPRINT PLAN

## 🎯 SPRINT OVERVIEW

**Sprint Goal:** Build production-ready frontend with authentication, core UI components, and initial module screens

**Duration:** 3-4 sessions (8-12 hours)

**Current Status:** Foundation complete ✅
- Next.js 14 setup
- NetSuite dark theme configured
- Demo dashboard created
- Port configuration (3001)

---

## 📊 SPRINT BACKLOG

### SPRINT 1: AUTHENTICATION & API INTEGRATION (2-3 hours)

**Goal:** Enable secure communication between frontend and backend

**User Stories:**

**US-1.1: As a user, I want to log in to the system**
- Acceptance Criteria:
  - [ ] Login page with email/password form
  - [ ] Form validation (Zod schema)
  - [ ] API call to POST /api/auth/login
  - [ ] JWT token storage (localStorage or cookies)
  - [ ] Error handling (invalid credentials)
  - [ ] Redirect to dashboard on success
- Estimate: 45 minutes
- Priority: HIGH

**US-1.2: As a user, I want my session to persist**
- Acceptance Criteria:
  - [ ] Auth context provider (React Context)
  - [ ] Token refresh logic
  - [ ] Auto-logout on token expiration
  - [ ] Protected route wrapper component
  - [ ] Redirect to login if not authenticated
- Estimate: 30 minutes
- Priority: HIGH

**US-1.3: As a developer, I want a configured API client**
- Acceptance Criteria:
  - [ ] Axios instance with base URL (http://localhost:3000)
  - [ ] Request interceptor (add JWT to headers)
  - [ ] Response interceptor (handle 401 errors)
  - [ ] TypeScript types for API responses
  - [ ] Error handling utilities
- Estimate: 30 minutes
- Priority: HIGH

**US-1.4: As a user, I want to log out**
- Acceptance Criteria:
  - [ ] Logout button in top navigation
  - [ ] Clear tokens from storage
  - [ ] Redirect to login page
  - [ ] Clear any cached user data
- Estimate: 15 minutes
- Priority: MEDIUM

**Sprint 1 Deliverables:**
- ✅ Working login flow
- ✅ Protected routes
- ✅ API client configured
- ✅ Session management

---

### SPRINT 2: CORE UI COMPONENTS (2-3 hours)

**Goal:** Build reusable component library for consistent UI

**User Stories:**

**US-2.1: As a developer, I want base UI components**
- Components to build:
  - [ ] Button (variants: primary, secondary, danger)
  - [ ] Input (text, email, password, number)
  - [ ] Label
  - [ ] Card (with header, body, footer)
  - [ ] Badge (for status indicators)
  - [ ] Spinner/Loading indicator
- Acceptance Criteria:
  - [ ] TypeScript props interfaces
  - [ ] Tailwind styling with NetSuite theme
  - [ ] Accessible (ARIA labels)
  - [ ] Storybook examples (optional)
- Estimate: 60 minutes
- Priority: HIGH

**US-2.2: As a developer, I want form components**
- Components to build:
  - [ ] Form wrapper (React Hook Form integration)
  - [ ] FormField (label + input + error)
  - [ ] Select/Dropdown
  - [ ] Textarea
  - [ ] Checkbox
  - [ ] DatePicker
- Acceptance Criteria:
  - [ ] Validation with Zod
  - [ ] Error message display
  - [ ] Controlled components
  - [ ] TypeScript types
- Estimate: 60 minutes
- Priority: HIGH

**US-2.3: As a developer, I want data display components**
- Components to build:
  - [ ] DataTable (with TanStack Table)
    - Sorting
    - Filtering
    - Pagination
    - Column visibility
  - [ ] StatCard (KPI display)
  - [ ] Chart wrapper (Recharts)
- Acceptance Criteria:
  - [ ] Responsive design
  - [ ] Loading states
  - [ ] Empty states
  - [ ] TypeScript generic types
- Estimate: 90 minutes
- Priority: HIGH

**US-2.4: As a developer, I want modal/dialog components**
- Components to build:
  - [ ] Modal/Dialog
  - [ ] Confirmation dialog
  - [ ] Drawer/Sidebar
- Acceptance Criteria:
  - [ ] Radix UI primitives
  - [ ] Keyboard navigation (ESC to close)
  - [ ] Focus trap
  - [ ] Animations
- Estimate: 45 minutes
- Priority: MEDIUM

**Sprint 2 Deliverables:**
- ✅ Component library (20+ components)
- ✅ Form validation system
- ✅ Data table with all features
- ✅ Modal system

---

### SPRINT 3: DASHBOARD & REAL DATA (1-2 hours)

**Goal:** Connect dashboard to backend APIs and display real data

**User Stories:**

**US-3.1: As a user, I want to see real KPIs on the dashboard**
- Acceptance Criteria:
  - [ ] Fetch data from backend APIs
  - [ ] Display real metrics (Revenue, Expenses, Cash Flow)
  - [ ] Show trend indicators (↑↓)
  - [ ] Loading skeletons
  - [ ] Error handling
  - [ ] Auto-refresh every 5 minutes
- API Endpoints to use:
  - GET /api/financial-reports/profit-and-loss
  - GET /api/financial-reports/balance-sheet
  - GET /api/cash-flow/:id/summary
- Estimate: 45 minutes
- Priority: HIGH

**US-3.2: As a user, I want to see recent transactions**
- Acceptance Criteria:
  - [ ] Fetch recent journal entries
  - [ ] Display in table format
  - [ ] Show entry number, date, description, amount
  - [ ] Click to view details
  - [ ] Pagination
- API Endpoint: GET /api/journal-entries?limit=10
- Estimate: 30 minutes
- Priority: MEDIUM

**US-3.3: As a user, I want to see charts with real data**
- Charts to build:
  - [ ] Revenue trend (bar chart)
  - [ ] Expense trend (line chart)
  - [ ] Cash flow projection (area chart)
- Acceptance Criteria:
  - [ ] Recharts integration
  - [ ] Responsive
  - [ ] Tooltips
  - [ ] Legend
  - [ ] NetSuite color scheme
- Estimate: 45 minutes
- Priority: MEDIUM

**Sprint 3 Deliverables:**
- ✅ Live dashboard with real data
- ✅ KPI cards with backend data
- ✅ Charts with actual numbers
- ✅ Recent transactions list

---

### SPRINT 4: ACCOUNTING MODULE SCREENS (2-3 hours)

**Goal:** Build complete accounting module UI

**User Stories:**

**US-4.1: As an accountant, I want to view the chart of accounts**
- Acceptance Criteria:
  - [ ] List all accounts in table
  - [ ] Search/filter by account number, name, type
  - [ ] Sort by any column
  - [ ] Show account balance (calculated)
  - [ ] Create new account button → modal
  - [ ] Edit account (inline or modal)
  - [ ] Delete account (with confirmation)
- API Endpoints:
  - GET /api/chart-of-accounts
  - POST /api/chart-of-accounts
  - PATCH /api/chart-of-accounts/:id
  - DELETE /api/chart-of-accounts/:id
- Estimate: 90 minutes
- Priority: HIGH

**US-4.2: As an accountant, I want to create journal entries**
- Acceptance Criteria:
  - [ ] Multi-step form (header + lines)
  - [ ] Add/remove lines dynamically
  - [ ] Account dropdown (searchable)
  - [ ] Debit/Credit inputs
  - [ ] Auto-calculate totals
  - [ ] Validation: debits must equal credits
  - [ ] Save as draft or post
  - [ ] Success/error messages
- API Endpoint: POST /api/journal-entries
- Estimate: 90 minutes
- Priority: HIGH

**US-4.3: As an accountant, I want to view financial reports**
- Reports to build:
  - [ ] Trial Balance
  - [ ] Profit & Loss Statement
  - [ ] Balance Sheet
  - [ ] General Ledger
- Acceptance Criteria:
  - [ ] Date range filters
  - [ ] Print/Export to PDF
  - [ ] Drill-down to details
  - [ ] Format numbers (currency)
  - [ ] Show variance for P&L
- API Endpoints:
  - GET /api/financial-reports/trial-balance
  - GET /api/financial-reports/profit-and-loss
  - GET /api/financial-reports/balance-sheet
  - GET /api/financial-reports/general-ledger
- Estimate: 60 minutes
- Priority: HIGH

**US-4.4: As an accountant, I want to manage budgets**
- Acceptance Criteria:
  - [ ] List budgets
  - [ ] Create budget with lines
  - [ ] Budget vs Actual comparison
  - [ ] Variance analysis
  - [ ] Approve budget workflow
- API Endpoints:
  - GET /api/budgets
  - POST /api/budgets
  - GET /api/budgets/:id/vs-actual
  - PATCH /api/budgets/:id/approve
- Estimate: 60 minutes
- Priority: MEDIUM

**Sprint 4 Deliverables:**
- ✅ Chart of Accounts screen
- ✅ Journal Entry form
- ✅ Financial Reports views
- ✅ Budget Management

---

## 🎯 DEFINITION OF DONE

A user story is "Done" when:
- [ ] Code is written and follows TypeScript best practices
- [ ] Component is responsive (mobile, tablet, desktop)
- [ ] Loading states implemented
- [ ] Error handling implemented
- [ ] Accessible (keyboard navigation, ARIA labels)
- [ ] Matches NetSuite dark theme design
- [ ] API integration working (if applicable)
- [ ] Manual testing completed
- [ ] Committed to Git with descriptive message

---

## 📈 SUCCESS METRICS

**Sprint 1:**
- Login success rate: 100%
- Token refresh working: ✅
- Protected routes working: ✅

**Sprint 2:**
- Components created: 20+
- Reusability: High
- TypeScript coverage: 100%

**Sprint 3:**
- Dashboard load time: < 2 seconds
- Data accuracy: 100%
- Real-time updates: Every 5 min

**Sprint 4:**
- Accounting workflows: 100% functional
- Form validation: Working
- Reports generated: Accurate

---

## 🚀 SPRINT EXECUTION ORDER

**Recommended sequence:**
1. **Sprint 1** (Authentication) - CRITICAL PATH
2. **Sprint 2** (UI Components) - FOUNDATION
3. **Sprint 3** (Dashboard) - QUICK WIN
4. **Sprint 4** (Accounting) - BUSINESS VALUE

**Estimated total time:** 8-12 hours (2-3 sessions)

---

## 📝 NOTES

- Each sprint can be done in one session
- Prioritize HIGH priority items first
- Can be done incrementally
- User Stories can be broken down further if needed
- Component library will speed up Sprint 4 significantly

---

## 🎨 DESIGN SYSTEM REFERENCE

**Colors:** See tailwind.config.ts
**Typography:** Inter font family
**Spacing:** Tailwind default scale
**Components:** Radix UI + custom styling
**Icons:** Lucide React

---

**Last Updated:** March 16, 2026
**Status:** Ready to start Sprint 1 🚀

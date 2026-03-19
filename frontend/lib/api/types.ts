// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role: string;
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  website?: string;
  paymentTerms?: string;
  currency?: string;
  category?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDto {
  code: string;
  name: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  website?: string;
  paymentTerms?: string;
  currency?: string;
  category?: string;
  notes?: string;
}

export type UpdateSupplierDto = Partial<CreateSupplierDto>;

// ─── Items ───────────────────────────────────────────────────────────────────

export type ItemType = 'raw_material' | 'finished_good' | 'work_in_progress' | 'service';
export type ValuationMethod = 'average' | 'fifo' | 'standard';

export interface Item {
  id: string;
  code: string;
  name: string;
  description?: string;
  itemType: ItemType;
  baseUom: string;
  isStockable: boolean;
  isPurchasable: boolean;
  isSaleable: boolean;
  isManufacturable: boolean;
  isLotTracked: boolean;
  isSerialTracked: boolean;
  valuationMethod: ValuationMethod;
  standardCost?: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemDto {
  code: string;
  name: string;
  description?: string;
  itemType: ItemType;
  baseUom: string;
  isStockable?: boolean;
  isPurchasable?: boolean;
  isSaleable?: boolean;
  isManufacturable?: boolean;
  isLotTracked?: boolean;
  isSerialTracked?: boolean;
  valuationMethod?: ValuationMethod;
  standardCost?: number;
  leadTimeDays?: number;
  safetyStock?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
}

export type UpdateItemDto = Partial<CreateItemDto>;

// ─── Warehouses ──────────────────────────────────────────────────────────────

export type WarehouseType = 'regular' | 'consignment' | 'transit';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  warehouseType: WarehouseType;
  address?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWarehouseDto {
  code: string;
  name: string;
  warehouseType?: WarehouseType;
  address?: string;
  isActive?: boolean;
}

export type UpdateWarehouseDto = Partial<CreateWarehouseDto>;

// ─── Stock Transactions ──────────────────────────────────────────────────────
// POST DTO uses transactionType/transactionDate (swagger names)
// Backend maps these to movementType/movementDate (Prisma field names)
// GET response returns Prisma field names: movementType, movementDate

export type TransactionType = 'receipt' | 'issue' | 'transfer' | 'adjustment';

export interface StockTransaction {
  id: string;
  movementNumber: string;
  movementType: TransactionType;
  movementDate: string;
  itemId: string;
  item?: Item;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  fromWarehouse?: Warehouse;
  quantity: number;
  uom: string;
  referenceId?: string;
  referenceType?: string;
  lotNumber?: string;
  serialNumber?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateStockTransactionDto {
  transactionType: TransactionType;
  itemId: string;
  warehouseId: string;
  quantity: number;
  uom: string;
  referenceId?: string;
  referenceType?: string;
  lotNumber?: string;
  serialNumber?: string;
  notes?: string;
  transactionDate?: string;
}

export interface StockBalance {
  id: string;
  itemId: string;
  item?: Item;
  warehouseId: string;
  warehouse?: Warehouse;
  onHandQuantity: number;
  reservedQuantity: number;
  unitCost: number;
  lotNumber?: string;
  serialNumber?: string;
}

// ─── Purchase Orders ─────────────────────────────────────────────────────────

export interface PurchaseOrderLine {
  id: string;
  lineNumber: number;
  itemId: string;
  item?: Item;
  description?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  uom: string;
  unitPrice: string;
  discountPercent: number;
  lineTotal: string;
  expectedDate?: string;
  status: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: Supplier;
  poDate: string;
  expectedDate?: string;
  paymentTerms?: string;
  currency?: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  status: string;
  notes?: string;
  lines: PurchaseOrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseOrderLineDto {
  itemId: string;
  description?: string;
  orderedQuantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  expectedDate?: string;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  expectedDate?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
  lines: CreatePurchaseOrderLineDto[];
}

export type UpdatePurchaseOrderDto = Partial<Omit<CreatePurchaseOrderDto, 'lines'>>;

// ─── Customers ───────────────────────────────────────────────────────────────

export type CreditStatus = 'good' | 'watch' | 'hold';

export interface Customer {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  website?: string;
  creditLimit: string;
  creditStatus: CreditStatus;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerDto {
  code: string;
  name: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  email?: string;
  website?: string;
  creditLimit?: number;
  creditStatus?: CreditStatus;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
}

export type UpdateCustomerDto = Partial<CreateCustomerDto>;

// ─── Sales Orders ────────────────────────────────────────────────────────────

export interface SalesOrderLine {
  id: string;
  lineNumber: number;
  itemId: string;
  item?: Item;
  description?: string;
  orderedQuantity: number;
  reservedQuantity: number;
  shippedQuantity: number;
  uom: string;
  unitPrice: string;
  discountPercent: number;
  lineTotal: string;
  deliveryDate?: string;
  status: string;
}

export interface SalesOrder {
  id: string;
  soNumber: string;
  customerId: string;
  customer?: Customer;
  orderDate: string;
  customerPo?: string;
  requestedDate?: string;
  promisedDate?: string;
  paymentTerms?: string;
  currency?: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  status: string;
  notes?: string;
  lines: SalesOrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSalesOrderLineDto {
  itemId: string;
  description?: string;
  orderedQuantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  deliveryDate?: string;
}

export interface CreateSalesOrderDto {
  customerId: string;
  customerPo?: string;
  requestedDate?: string;
  promisedDate?: string;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
  lines: CreateSalesOrderLineDto[];
}

export type UpdateSalesOrderDto = Partial<Omit<CreateSalesOrderDto, 'lines'>>;

// ─── Chart of Accounts ───────────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost';

export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType: AccountType;
  accountCategory?: string;
  parentAccountId?: string;
  currency?: string;
  isSystem: boolean;
  allowManualPosting: boolean;
  requireReconciliation: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountDto {
  accountNumber: string;
  name: string;
  accountType: AccountType;
  accountCategory?: string;
  parentAccountId?: string;
  currency?: string;
  isActive?: boolean;
  allowManualPosting?: boolean;
}

export type UpdateAccountDto = Partial<CreateAccountDto>;

// ─── Journal Entries ─────────────────────────────────────────────────────────

export type JournalType = 'general' | 'adjustment' | 'closing' | 'opening';
export type EntryStatus = 'draft' | 'posted';

export interface JournalEntryLine {
  id: string;
  lineNumber: number;
  accountId: string;
  account?: Account;
  description?: string;
  debitAmount: number;
  creditAmount: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  postingDate: string;
  fiscalPeriod: string;
  journalType: JournalType;
  reference?: string;
  description?: string;
  status: EntryStatus;
  lines: JournalEntryLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateJournalEntryLineDto {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
}

export interface CreateJournalEntryDto {
  entryDate: string;
  journalType: JournalType;
  description?: string;
  reference?: string;
  lines: CreateJournalEntryLineDto[];
}

export interface UpdateJournalEntryDto {
  entryDate?: string;
  description?: string;
  reference?: string;
}

// ─── Fiscal Periods ──────────────────────────────────────────────────────────

export type FiscalPeriodStatus = 'open' | 'closed' | 'locked';

export interface FiscalPeriod {
  id: string;
  periodCode: string;
  periodName: string;
  startDate: string;
  endDate: string;
  fiscalYear: string;
  fiscalQuarter?: string;
  status: FiscalPeriodStatus;
  isCurrent: boolean;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFiscalPeriodDto {
  periodCode: string;
  periodName: string;
  startDate: string;
  endDate: string;
  fiscalYear: string;
  fiscalQuarter?: string;
  status?: FiscalPeriodStatus;
  isCurrent?: boolean;
}

export type UpdateFiscalPeriodDto = Partial<CreateFiscalPeriodDto>;

// ─── BOM ─────────────────────────────────────────────────────────────────────
// POST DTO uses itemId/bomCode/quantity (swagger names)
// Backend maps: itemId→parentItemId, bomCode→bomNumber, quantity→quantityPer
// GET response returns Prisma field names

export interface BomComponent {
  id: string;
  lineNumber: number;
  componentItemId: string;
  componentItem?: Item;
  quantityPer: number;
  uom: string;
  scrapPercent: number;
  isPhantom: boolean;
}

export interface Bom {
  id: string;
  bomNumber: string;
  parentItemId: string;
  parentItem?: Item;
  version: number;
  isActive: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  components: BomComponent[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBomComponentDto {
  componentItemId: string;
  quantity: number;
  uom: string;
  scrapPercent?: number;
}

export interface CreateBomDto {
  itemId: string;
  bomCode?: string;
  version?: string;
  isActive?: boolean;
  components: CreateBomComponentDto[];
}

export type UpdateBomDto = Omit<Partial<CreateBomDto>, 'components'>;

// ─── Work Centers ─────────────────────────────────────────────────────────────

export type WorkCenterType = 'machine' | 'labor' | 'assembly' | 'quality';

export interface WorkCenter {
  id: string;
  code: string;
  name: string;
  workCenterType: WorkCenterType;
  capacityPerHour?: number;
  efficiencyPercent: number;
  costPerHour?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkCenterDto {
  code: string;
  name: string;
  workCenterType?: WorkCenterType;
  capacityPerHour?: number;
  efficiencyPercent?: number;
  costPerHour?: number;
  isActive?: boolean;
  notes?: string;
}

export type UpdateWorkCenterDto = Partial<CreateWorkCenterDto>;

// ─── Production Orders ───────────────────────────────────────────────────────
// POST DTO uses quantityOrdered (swagger name)
// Backend maps: quantityOrdered → quantityToProduce (Prisma field)
// GET response returns Prisma field names

export type ProductionOrderStatus = 'draft' | 'released' | 'in_progress' | 'completed' | 'cancelled';
export type ProductionPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProductionOrder {
  id: string;
  poNumber: string;
  itemId: string;
  bomId?: string;
  bom?: Bom;
  quantityToProduce: number;
  quantityProduced: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: ProductionOrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionOrderDto {
  bomId: string;
  workCenterId?: string;
  quantityOrdered: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  priority?: ProductionPriority;
  notes?: string;
}

export type UpdateProductionOrderDto = Partial<CreateProductionOrderDto>;

// ─── Financial Reports ────────────────────────────────────────────────────────

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  fiscalPeriod?: string;
  accountType?: AccountType;
  accountNumber?: string;
}

export interface PLAccountLine {
  accountNumber: string;
  accountName: string;
  accountCategory?: string;
  amount: number;
}

export interface PLReport {
  reportName: string;
  parameters: Record<string, string>;
  period: { startDate: string; endDate: string };
  revenue:     { accounts: PLAccountLine[]; total: number };
  costOfSales: { accounts: PLAccountLine[]; total: number };
  grossProfit: number;
  expenses:    { accounts: PLAccountLine[]; total: number };
  netIncome:   number;
}

export interface BSAccountLine {
  accountNumber: string;
  accountName: string;
  accountCategory?: string;
  amount: number;
}

export interface BalanceSheetReport {
  reportName: string;
  parameters: Record<string, string>;
  asOfDate: string;
  assets:      { accounts: BSAccountLine[]; total: number };
  liabilities: { accounts: BSAccountLine[]; total: number };
  equity:      { accounts: BSAccountLine[]; total: number };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

export interface TBAccountLine {
  accountNumber: string;
  accountName: string;
  accountType: string;
  totalDebits: number;
  totalCredits: number;
  netBalance: number;
}

export interface TrialBalanceReport {
  reportName: string;
  parameters: Record<string, string>;
  asOfDate: string;
  accounts: TBAccountLine[];
  totals: {
    totalDebits: number;
    totalCredits: number;
    difference: number;
    isBalanced: boolean;
  };
}

export interface GLEntry {
  date: string;
  entryNumber: string;
  accountNumber: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

export interface GLReport {
  reportName: string;
  parameters: Record<string, string>;
  entries: GLEntry[];
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export type BudgetStatus = 'draft' | 'approved';

export interface BudgetLine {
  id: string;
  accountId: string;
  account?: Account;
  fiscalPeriod: string;
  budgetAmount: number;
  notes?: string;
}

export interface Budget {
  id: string;
  budgetCode: string;
  budgetName: string;
  fiscalYear: string;
  description?: string;
  status: BudgetStatus;
  approvedAt?: string;
  budgetLines: BudgetLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBudgetDto {
  budgetCode: string;
  budgetName: string;
  fiscalYear: string;
  description?: string;
}

export type UpdateBudgetDto = Partial<CreateBudgetDto>;

export interface CreateBudgetLineDto {
  accountId: string;
  fiscalPeriod: string;
  budgetAmount: number;
  notes?: string;
}

// ─── Cash Flow ────────────────────────────────────────────────────────────────

export type CashFlowScenario = 'optimistic' | 'realistic' | 'pessimistic';
export type CashFlowLineType = 'inflow' | 'outflow';

export interface CashFlowLine {
  id: string;
  lineDate: string;
  lineType: CashFlowLineType;
  category: string;
  amount: number;
  description?: string;
  accountId?: string;
  account?: Account;
}

export interface CashFlowProjection {
  id: string;
  projectionCode: string;
  projectionName: string;
  startDate: string;
  endDate: string;
  scenario: CashFlowScenario;
  description?: string;
  cashFlowLines: CashFlowLine[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCashFlowProjectionDto {
  projectionCode: string;
  projectionName: string;
  startDate: string;
  endDate: string;
  scenario: CashFlowScenario;
  description?: string;
}

export type UpdateCashFlowProjectionDto = Partial<CreateCashFlowProjectionDto>;

export interface CreateCashFlowLineDto {
  lineDate: string;
  lineType: CashFlowLineType;
  category: string;
  amount: number;
  description?: string;
  accountId?: string;
}
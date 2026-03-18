// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  user: User;
}

// ─── Suppliers ────────────────────────────────────────────────────────────────

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
  creditLimit?: string | null;
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

// ─── Items ────────────────────────────────────────────────────────────────────

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
  valuationMethod?: ValuationMethod;
  standardCost?: number;
  leadTimeDays?: number;
  safetyStock?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateItemDto {
  code: string;
  name: string;
  itemType: ItemType;
  baseUom: string;
  description?: string;
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

// ─── Purchase Orders ──────────────────────────────────────────────────────────

export type POStatus = 'draft' | 'approved' | 'rejected' | 'closed';

export interface PurchaseOrderLine {
  id: string;
  itemId: string;
  item?: Item;
  description?: string;
  orderedQuantity: number;
  receivedQuantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  lineTotal: number;
  expectedDate?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: Supplier;
  status: POStatus;
  expectedDate?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
  totalAmount: number;
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

export type UpdatePurchaseOrderDto = Omit<Partial<CreatePurchaseOrderDto>, 'lines'>;

// ─── Customers ────────────────────────────────────────────────────────────────

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
  creditLimit?: string | null;  // backend returns as string
  creditStatus?: CreditStatus;
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

// ─── Sales Orders ─────────────────────────────────────────────────────────────

export type SOStatus = 'draft' | 'confirmed' | 'shipped' | 'delivered' | 'closed';

export interface SalesOrderLine {
  id: string;
  itemId: string;
  item?: Item;
  description?: string;
  orderedQuantity: number;
  shippedQuantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
  lineTotal: number;
  deliveryDate?: string;
}

export interface SalesOrder {
  id: string;
  soNumber: string;
  customerId: string;
  customer?: Customer;
  customerPo?: string;
  status: SOStatus;
  requestedDate?: string;
  promisedDate?: string;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
  totalAmount: number;
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

export type UpdateSalesOrderDto = Omit<Partial<CreateSalesOrderDto>, 'lines'>;

// ─── Warehouses ───────────────────────────────────────────────────────────────

export type WarehouseType = 'regular' | 'consignment' | 'transit';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  warehouseType?: WarehouseType;
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

// ─── Stock Transactions ───────────────────────────────────────────────────────

export type TransactionType = 'receipt' | 'issue' | 'transfer' | 'adjustment';

export interface StockTransaction {
  id: string;
  transactionType: TransactionType;
  itemId: string;
  item?: Item;
  warehouseId: string;
  warehouse?: Warehouse;
  quantity: number;
  uom: string;
  referenceId?: string;
  referenceType?: string;
  lotNumber?: string;
  serialNumber?: string;
  notes?: string;
  transactionDate: string;
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
  itemId: string;
  item?: Item;
  warehouseId: string;
  warehouse?: Warehouse;
  quantity: number;
  uom: string;
}

// ─── Chart of Accounts ────────────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: string;
  accountNumber: string;
  name: string;
  accountType: AccountType;
  accountCategory?: string;
  parentAccountId?: string | null;
  currency?: string;
  isActive: boolean;
  isSystem: boolean;
  allowManualPosting: boolean;
  requireReconciliation: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountDto {
  // POST uses accountCode/accountName (backend inconsistency vs GET which returns accountNumber/name)
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  accountSubType?: string;
  currency?: string;
  isActive?: boolean;
}

export type UpdateAccountDto = Partial<CreateAccountDto>;

// ─── Journal Entries ──────────────────────────────────────────────────────────

// Backend accepts entryType in POST but returns journalType in GET (internal inconsistency)
export type JournalType = 'general' | 'adjustment' | 'closing' | 'opening';
export type EntryType   = 'general' | 'adjustment' | 'closing' | 'opening'; // alias for POST
export type EntryStatus = 'draft' | 'posted';

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  account?: { accountNumber: string; name: string };
  description?: string;
  debitAmount: number;
  creditAmount: number;
  currency?: string;
  exchangeRate?: number;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  postingDate?: string;
  fiscalPeriod?: string;
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
  currency?: string;
}

export interface CreateJournalEntryDto {
  entryDate: string;
  entryType: EntryType;   // POST field name (backend inconsistency)
  description?: string;
  fiscalPeriod?: string;
  lines: CreateJournalEntryLineDto[];
}

export type UpdateJournalEntryDto = Omit<Partial<CreateJournalEntryDto>, 'lines'>;

// ─── Fiscal Periods ───────────────────────────────────────────────────────────

export type PeriodStatus = 'open' | 'closed' | 'locked';

export interface FiscalPeriod {
  id: string;
  periodCode: string;
  periodName: string;
  startDate: string;
  endDate: string;
  fiscalYear: string;
  fiscalQuarter?: string;
  status: PeriodStatus;
  isCurrent: boolean;
  closedAt?: string;
  closedBy?: string;
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
  status?: PeriodStatus;
  isCurrent?: boolean;
}

export type UpdateFiscalPeriodDto = Partial<CreateFiscalPeriodDto>;

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
  status: BudgetStatus;
  description?: string;
  lines: BudgetLine[];
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
}

export interface CashFlowProjection {
  id: string;
  projectionCode: string;
  projectionName: string;
  startDate: string;
  endDate: string;
  scenario: CashFlowScenario;
  description?: string;
  lines: CashFlowLine[];
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

// ─── BOM ─────────────────────────────────────────────────────────────────────

export interface BomComponent {
  id: string;
  componentItemId: string;
  componentItem?: Item;
  quantity: number;
  uom: string;
  scrapPercent?: number;
  notes?: string;
}

export interface Bom {
  id: string;
  itemId: string;
  item?: Item;
  bomCode?: string;
  description?: string;
  version?: string;
  isActive: boolean;
  components: BomComponent[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBomComponentDto {
  componentItemId: string;
  quantity: number;
  uom: string;
  scrapPercent?: number;
  notes?: string;
}

export interface CreateBomDto {
  itemId: string;
  bomCode?: string;
  description?: string;
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
  workCenterType?: WorkCenterType;
  capacityPerHour?: number;
  efficiencyPercent?: number;
  costPerHour?: number;
  isActive: boolean;
  notes?: string;
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

// ─── Production Orders ────────────────────────────────────────────────────────

export type ProductionOrderStatus = 'draft' | 'released' | 'in_progress' | 'completed' | 'cancelled';
export type ProductionPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProductionOrder {
  id: string;
  orderNumber: string;
  bomId: string;
  bom?: Bom;
  workCenterId?: string;
  workCenter?: WorkCenter;
  status: ProductionOrderStatus;
  quantityOrdered: number;
  quantityProduced?: number;
  priority?: ProductionPriority;
  plannedStartDate?: string;
  plannedEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
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
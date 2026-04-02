// ============================================================================
// frontend/lib/api/types.ts
// Domain types organized by business module
// ============================================================================

// ─── Identity & Access Management ────────────────────────────────────────────

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface TenantInfo {
  id:        string;
  code:      string;
  name:      string;
  industry?: string;
}

export interface User {
  id:          string;
  email:       string;
  firstName:   string;
  lastName:    string;
  tenantId:    string;
  role:        string;
  permissions: string[];
}

export interface LoginResponse {
  access_token:             string;
  token_type?:              string;
  user:                     User;
  tenant?:                  TenantInfo;
  requiresTenantSelection?: boolean;
  tenants?:                 TenantInfo[];
}

// ─── Master Data — Items & Catalog ────────────────────────────────────────────

export type ItemType        = 'raw_material' | 'finished_good' | 'work_in_progress' | 'service';
export type ValuationMethod = 'average' | 'fifo' | 'standard';

export interface Item {
  id:          string;
  code:        string;
  name:        string;
  description?: string;
  itemType:    ItemType;
  baseUom:     string;
  // Triple UOM (Sprint 14A — ADR-013)
  purchaseUomId?:               string;
  purchaseUom?:                 { id: string; code: string; name: string };
  purchaseToConsumptionFactor?: number;
  storageUomId?:                string;
  storageUom?:                  { id: string; code: string; name: string };
  storageToConsumptionFactor?:  number;
  consumptionUomId?:            string;
  consumptionUom?:              { id: string; code: string; name: string };
  isStockable:      boolean;
  isPurchasable:    boolean;
  isSaleable:       boolean;
  isManufacturable: boolean;
  isLotTracked:     boolean;
  isSerialTracked:  boolean;
  valuationMethod:  ValuationMethod;
  standardCost?:    number;
  leadTimeDays:     number;
  safetyStock:      number;
  reorderPoint:     number;
  reorderQuantity:  number;
  isActive:         boolean;
  createdAt:        string;
  updatedAt:        string;
}

export interface CreateItemDto {
  code:             string;
  name:             string;
  description?:     string;
  itemType:         ItemType;
  baseUom:          string;
  isStockable?:     boolean;
  isPurchasable?:   boolean;
  isSaleable?:      boolean;
  isManufacturable?:boolean;
  isLotTracked?:    boolean;
  isSerialTracked?: boolean;
  valuationMethod?: ValuationMethod;
  standardCost?:    number;
  leadTimeDays?:    number;
  safetyStock?:     number;
  reorderPoint?:    number;
  reorderQuantity?: number;
}

export type UpdateItemDto = Partial<CreateItemDto>;

// ─── Master Data — Categories ─────────────────────────────────────────────────

export interface MacroCategory {
  id:          string;
  tenantId:    string;
  code:        string;
  name:        string;
  description?: string;
  isActive:    boolean;
  createdAt:   string;
  updatedAt:   string;
  _count?:     { categories: number };
  categories?: Category[];
}

export interface CreateMacroCategoryDto {
  code:         string;
  name:         string;
  description?: string;
  isActive?:    boolean;
}

export type UpdateMacroCategoryDto = Partial<CreateMacroCategoryDto>;

export interface Category {
  id:                 string;
  tenantId:           string;
  macroCategoryId:    string;
  code:               string;
  name:               string;
  description?:       string;
  inventoryAccountId?: string;
  cogsAccountId?:     string;
  isActive:           boolean;
  createdAt:          string;
  updatedAt:          string;
  macroCategory?:     Pick<MacroCategory, 'id' | 'code' | 'name'>;
  inventoryAccount?:  { accountNumber: string; name: string };
  cogsAccount?:       { accountNumber: string; name: string };
  _count?:            { items: number };
}

export interface CreateCategoryDto {
  macroCategoryId:     string;
  code:                string;
  name:                string;
  description?:        string;
  inventoryAccountId?: string;
  cogsAccountId?:      string;
  isActive?:           boolean;
}

export type UpdateCategoryDto = Partial<CreateCategoryDto>;

export interface ConsumptionGroup {
  id:               string;
  tenantId:         string;
  code:             string;
  name:             string;
  description?:     string;
  consumptionUomId: string;
  isActive:         boolean;
  createdAt:        string;
  updatedAt:        string;
  consumptionUom?:  UomUnit;
  _count?:          { items: number };
  totalConsumptionQty?: number;
}

export interface CreateConsumptionGroupDto {
  code:             string;
  name:             string;
  description?:     string;
  consumptionUomId: string;
  isActive?:        boolean;
}

export type UpdateConsumptionGroupDto = Partial<CreateConsumptionGroupDto>;

// ─── Master Data — Units of Measure ──────────────────────────────────────────

export interface UomUnit {
  id:        string;
  code:      string;
  name:      string;
  type:      'volume' | 'mass' | 'count' | 'length' | 'area' | 'time';
  system:    'metric' | 'imperial' | 'universal';
  isBase:    boolean;
  isActive:  boolean;
  symbol?:   string;
  createdAt: string;
  updatedAt: string;
}

export interface UomConversion {
  id:        string;
  fromUomId: string;
  toUomId:   string;
  factor:    number;
  isActive:  boolean;
  fromUom:   Pick<UomUnit, 'code' | 'name' | 'type' | 'system'>;
  toUom:     Pick<UomUnit, 'code' | 'name' | 'type' | 'system'>;
}

export interface UomConvertResult {
  fromUom:     string;
  toUom:       string;
  inputQty:    number;
  outputQty:   number;
  factor:      number;
  isAutomatic: boolean;
}

// ─── Inventory — Warehouses & Locations ───────────────────────────────────────

export type WarehouseType = 'regular' | 'consignment' | 'transit';

export interface Warehouse {
  id:            string;
  code:          string;
  name:          string;
  warehouseType: WarehouseType;
  address?:      string;
  isActive:      boolean;
  createdAt:     string;
  updatedAt:     string;
}

export interface CreateWarehouseDto {
  code:          string;
  name:          string;
  warehouseType?: WarehouseType;
  address?:      string;
  isActive?:     boolean;
}

export type UpdateWarehouseDto = Partial<CreateWarehouseDto>;

// ─── Inventory — Stock ────────────────────────────────────────────────────────

export type TransactionType = 'receipt' | 'issue' | 'transfer' | 'adjustment';

export interface StockTransaction {
  id:             string;
  movementNumber: string;
  movementType:   TransactionType;
  movementDate:   string;
  itemId:         string;
  item?:          Item;
  fromWarehouseId?: string;
  toWarehouseId?:   string;
  fromWarehouse?:   Warehouse;
  // Storage UOM (backward compat)
  quantity: number;
  uom:      string;
  // Purchase UOM — financial unit (Sprint 14A)
  purchaseQty?: number;
  purchaseUom?: string;
  // Consumption UOM — production unit (Sprint 14A)
  consumptionQty?: number;
  consumptionUom?: string;
  // Financial audit (Sprint 14A — ADR-019)
  unitCostAtMovement?: number;
  movementValue?:      number;
  unitCost?:           number;
  referenceId?:        string;
  referenceType?:      string;
  lotNumber?:          string;
  serialNumber?:       string;
  notes?:    string;
  createdAt: string;
}

export interface CreateStockTransactionDto {
  transactionType: TransactionType;
  itemId:          string;
  warehouseId:     string;
  quantity:        number;
  uom:             string;
  unitCost?:       number;
  referenceId?:    string;
  referenceType?:  string;
  lotNumber?:      string;
  serialNumber?:   string;
  notes?:          string;
  transactionDate?: string;
}

// Triple UOM stock balance (Sprint 14A — ADR-014, ADR-019)
export interface StockBalance {
  id:         string;
  itemId:     string;
  item?: {
    id: string; code: string; name: string; itemType: string; baseUom: string;
    standardCost?: number;
    purchaseUom?:    { id: string; code: string; name: string };
    storageUom?:     { id: string; code: string; name: string };
    consumptionUom?: { id: string; code: string; name: string };
    purchaseToConsumptionFactor?: number;
    storageToConsumptionFactor?:  number;
  };
  warehouseId: string;
  warehouse?:  { id: string; code: string; name: string };
  // Purchase UOM — financial unit of record
  purchaseQty: number;
  purchaseUom: string;
  unitCost:    number;
  totalValue:  number;
  // Storage UOM — warehouse operational
  onHandQuantity:  number;
  storageQty:      number;
  storageUom:      string;
  unitCostStorage: number;
  // Consumption UOM — production operational
  consumptionQty:          number;
  consumptionUom:          string;
  unitCostConsumption:     number;
  // Reserved / Available (in storageUom)
  reservedQuantity: number;
  availableQty:     number;
  // Lot / Serial
  lotNumber?:    string;
  serialNumber?: string;
}

// ─── Procurement — Suppliers ──────────────────────────────────────────────────

export interface Supplier {
  id:           string;
  code:         string;
  name:         string;
  legalName?:   string;
  taxId?:       string;
  phone?:       string;
  email?:       string;
  website?:     string;
  paymentTerms?: string;
  currency?:    string;
  category?:    string;
  notes?:       string;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateSupplierDto {
  code:          string;
  name:          string;
  legalName?:    string;
  taxId?:        string;
  phone?:        string;
  email?:        string;
  website?:      string;
  paymentTerms?: string;
  currency?:     string;
  category?:     string;
  notes?:        string;
}

export type UpdateSupplierDto = Partial<CreateSupplierDto>;

export interface SupplierItem {
  id:                string;
  tenantId:          string;
  supplierId:        string;
  itemId:            string;
  supplierItemCode?: string;
  supplierItemName?: string;
  purchaseUomId:     string;
  packSize:          number;
  conversionFactor:  number;
  lastPrice?:        number;
  leadTimeDays:      number;
  moq:               number;
  isPreferred:       boolean;
  isActive:          boolean;
  notes?:            string;
  createdAt:         string;
  updatedAt:         string;
  supplier?:    { id: string; code: string; name: string };
  item?:        { id: string; code: string; name: string; consumptionUomId?: string; baseUom: string };
  purchaseUom?: Pick<UomUnit, 'id' | 'code' | 'name' | 'type' | 'system'>;
  conversionPreview?: string;
}

export interface CreateSupplierItemDto {
  supplierId:        string;
  itemId:            string;
  supplierItemCode?: string;
  supplierItemName?: string;
  purchaseUomId:     string;
  packSize?:         number;
  conversionFactor?: number;
  lastPrice?:        number;
  leadTimeDays?:     number;
  moq?:              number;
  isPreferred?:      boolean;
  isActive?:         boolean;
  notes?:            string;
}

export interface UpdateSupplierItemDto {
  supplierItemCode?: string;
  supplierItemName?: string;
  purchaseUomId?:    string;
  packSize?:         number;
  conversionFactor?: number;
  lastPrice?:        number;
  leadTimeDays?:     number;
  moq?:              number;
  isPreferred?:      boolean;
  isActive?:         boolean;
  notes?:            string;
}

// ─── Procurement — Purchase Orders ────────────────────────────────────────────

export interface PurchaseOrderLine {
  id:               string;
  lineNumber:       number;
  itemId:           string;
  item?:            Item;
  description?:     string;
  orderedQuantity:  number;
  receivedQuantity: number;
  uom:              string;
  unitPrice:        string;
  discountPercent:  number;
  lineTotal:        string;
  expectedDate?:    string;
  status:           string;
}

export interface PurchaseOrder {
  id:           string;
  poNumber:     string;
  supplierId:   string;
  supplier?:    Supplier;
  poDate:       string;
  expectedDate?: string;
  paymentTerms?: string;
  currency?:    string;
  subtotal:     string;
  taxAmount:    string;
  total:        string;
  status:       string;
  notes?:       string;
  lines:        PurchaseOrderLine[];
  createdAt:    string;
  updatedAt:    string;
}

export interface CreatePurchaseOrderLineDto {
  itemId:          string;
  description?:    string;
  orderedQuantity: number;
  uom:             string;
  unitPrice:       number;
  discountPercent?: number;
  expectedDate?:   string;
}

export interface CreatePurchaseOrderDto {
  supplierId:       string;
  expectedDate?:    string;
  deliveryAddress?: string;
  paymentTerms?:    string;
  currency?:        string;
  notes?:           string;
  lines:            CreatePurchaseOrderLineDto[];
}

export type UpdatePurchaseOrderDto = Partial<Omit<CreatePurchaseOrderDto, 'lines'>>;

// ─── Sales — Customers ────────────────────────────────────────────────────────

export type CreditStatus = 'good' | 'watch' | 'hold';

export interface Customer {
  id:           string;
  code:         string;
  name:         string;
  legalName?:   string;
  taxId?:       string;
  phone?:       string;
  email?:       string;
  website?:     string;
  creditLimit:  string;
  creditStatus: CreditStatus;
  paymentTerms?: string;
  currency?:    string;
  notes?:       string;
  isActive:     boolean;
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateCustomerDto {
  code:          string;
  name:          string;
  legalName?:    string;
  taxId?:        string;
  phone?:        string;
  email?:        string;
  website?:      string;
  creditLimit?:  number;
  creditStatus?: CreditStatus;
  paymentTerms?: string;
  currency?:     string;
  notes?:        string;
}

export type UpdateCustomerDto = Partial<CreateCustomerDto>;

// ─── Sales — Sales Orders ─────────────────────────────────────────────────────

export interface SalesOrderLine {
  id:               string;
  lineNumber:       number;
  itemId:           string;
  item?:            Item;
  description?:     string;
  orderedQuantity:  number;
  reservedQuantity: number;
  shippedQuantity:  number;
  uom:              string;
  unitPrice:        string;
  discountPercent:  number;
  lineTotal:        string;
  deliveryDate?:    string;
  status:           string;
}

export interface SalesOrder {
  id:            string;
  soNumber:      string;
  customerId:    string;
  customer?:     Customer;
  orderDate:     string;
  customerPo?:   string;
  requestedDate?: string;
  promisedDate?: string;
  paymentTerms?: string;
  currency?:     string;
  subtotal:      string;
  taxAmount:     string;
  total:         string;
  status:        string;
  notes?:        string;
  lines:         SalesOrderLine[];
  createdAt:     string;
  updatedAt:     string;
}

export interface CreateSalesOrderLineDto {
  itemId:          string;
  description?:    string;
  orderedQuantity: number;
  uom:             string;
  unitPrice:       number;
  discountPercent?: number;
  deliveryDate?:   string;
}

export interface CreateSalesOrderDto {
  customerId:     string;
  customerPo?:    string;
  requestedDate?: string;
  promisedDate?:  string;
  paymentTerms?:  string;
  currency?:      string;
  notes?:         string;
  lines:          CreateSalesOrderLineDto[];
}

export type UpdateSalesOrderDto = Partial<Omit<CreateSalesOrderDto, 'lines'>>;

// ─── Manufacturing — Bill of Materials ────────────────────────────────────────

export interface BomComponent {
  id:              string;
  lineNumber:      number;
  componentItemId: string;
  componentItem?:  Item;
  quantityPer:     number;
  uom:             string;
  scrapPercent:    number;
  isPhantom:       boolean;
}

export interface Bom {
  id:           string;
  bomNumber:    string;
  parentItemId: string;
  parentItem?:  Item;
  version:      number;
  isActive:     boolean;
  effectiveFrom?: string;
  effectiveTo?:   string;
  components:   BomComponent[];
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateBomComponentDto {
  componentItemId: string;
  quantity:        number;
  uom:             string;
  scrapPercent?:   number;
}

export interface CreateBomDto {
  itemId:      string;
  bomCode?:    string;
  version?:    string;
  isActive?:   boolean;
  components:  CreateBomComponentDto[];
}

export type UpdateBomDto = Omit<Partial<CreateBomDto>, 'components'>;

// ─── Manufacturing — Work Centers ─────────────────────────────────────────────

export type WorkCenterType = 'machine' | 'labor' | 'assembly' | 'quality';

export interface WorkCenter {
  id:                string;
  code:              string;
  name:              string;
  workCenterType:    WorkCenterType;
  capacityPerHour?:  number;
  efficiencyPercent: number;
  costPerHour?:      number;
  isActive:          boolean;
  createdAt:         string;
  updatedAt:         string;
}

export interface CreateWorkCenterDto {
  code:              string;
  name:              string;
  workCenterType?:   WorkCenterType;
  capacityPerHour?:  number;
  efficiencyPercent?: number;
  costPerHour?:      number;
  isActive?:         boolean;
  notes?:            string;
}

export type UpdateWorkCenterDto = Partial<CreateWorkCenterDto>;

// ─── Manufacturing — Production Orders ───────────────────────────────────────

export type ProductionOrderStatus = 'draft' | 'released' | 'in_progress' | 'completed' | 'cancelled';
export type ProductionPriority    = 'low' | 'medium' | 'high' | 'urgent';

export interface ProductionOrder {
  id:                string;
  poNumber:          string;
  itemId:            string;
  bomId?:            string;
  bom?:              Bom;
  quantityToProduce: number;
  quantityProduced:  number;
  plannedStartDate?: string;
  plannedEndDate?:   string;
  actualStartDate?:  string;
  actualEndDate?:    string;
  status:            ProductionOrderStatus;
  notes?:            string;
  createdAt:         string;
  updatedAt:         string;
}

export interface CreateProductionOrderDto {
  bomId:             string;
  workCenterId?:     string;
  quantityOrdered:   number;
  plannedStartDate?: string;
  plannedEndDate?:   string;
  priority?:         ProductionPriority;
  notes?:            string;
}

export type UpdateProductionOrderDto = Partial<CreateProductionOrderDto>;

// ─── Accounting — Chart of Accounts ──────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost';

export interface Account {
  id:                    string;
  accountNumber:         string;
  name:                  string;
  accountType:           AccountType;
  accountCategory?:      string;
  parentAccountId?:      string;
  currency?:             string;
  isSystem:              boolean;
  allowManualPosting:    boolean;
  requireReconciliation: boolean;
  isActive:              boolean;
  createdAt:             string;
  updatedAt:             string;
}

export interface CreateAccountDto {
  accountNumber:      string;
  name:               string;
  accountType:        AccountType;
  accountCategory?:   string;
  parentAccountId?:   string;
  currency?:          string;
  isActive?:          boolean;
  allowManualPosting?: boolean;
}

export type UpdateAccountDto = Partial<CreateAccountDto>;

// ─── Accounting — Journal Entries ────────────────────────────────────────────

export type JournalType = 'general' | 'adjustment' | 'closing' | 'opening';
export type EntryStatus  = 'draft' | 'posted';

export interface JournalEntryLine {
  id:           string;
  lineNumber:   number;
  accountId:    string;
  account?:     Account;
  description?: string;
  debitAmount:  number;
  creditAmount: number;
}

export interface JournalEntry {
  id:           string;
  entryNumber:  string;
  entryDate:    string;
  postingDate:  string;
  fiscalPeriod: string;
  journalType:  JournalType;
  reference?:   string;
  description?: string;
  status:       EntryStatus;
  lines:        JournalEntryLine[];
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateJournalEntryLineDto {
  accountId:    string;
  debitAmount:  number;
  creditAmount: number;
  description?: string;
}

export interface CreateJournalEntryDto {
  entryDate:    string;
  journalType:  JournalType;
  description?: string;
  reference?:   string;
  lines:        CreateJournalEntryLineDto[];
}

export interface UpdateJournalEntryDto {
  entryDate?:    string;
  description?:  string;
  reference?:    string;
}

// ─── Accounting — Fiscal Periods ─────────────────────────────────────────────

export type FiscalPeriodStatus = 'open' | 'closed' | 'locked';

export interface FiscalPeriod {
  id:             string;
  periodCode:     string;
  periodName:     string;
  startDate:      string;
  endDate:        string;
  fiscalYear:     string;
  fiscalQuarter?: string;
  status:         FiscalPeriodStatus;
  isCurrent:      boolean;
  closedAt?:      string;
  createdAt:      string;
  updatedAt:      string;
}

export interface CreateFiscalPeriodDto {
  periodCode:     string;
  periodName:     string;
  startDate:      string;
  endDate:        string;
  fiscalYear:     string;
  fiscalQuarter?: string;
  status?:        FiscalPeriodStatus;
  isCurrent?:     boolean;
}

export type UpdateFiscalPeriodDto = Partial<CreateFiscalPeriodDto>;

// ─── Accounting — Financial Reports ──────────────────────────────────────────

export interface ReportFilters {
  startDate?:    string;
  endDate?:      string;
  fiscalPeriod?: string;
  accountType?:  AccountType;
  accountNumber?: string;
}

export interface PLAccountLine {
  accountNumber:    string;
  accountName:      string;
  accountCategory?: string;
  amount:           number;
}

export interface PLReport {
  reportName:  string;
  parameters:  Record<string, string>;
  period:      { startDate: string; endDate: string };
  revenue:     { accounts: PLAccountLine[]; total: number };
  costOfSales: { accounts: PLAccountLine[]; total: number };
  grossProfit: number;
  expenses:    { accounts: PLAccountLine[]; total: number };
  netIncome:   number;
}

export interface BSAccountLine {
  accountNumber:    string;
  accountName:      string;
  accountCategory?: string;
  amount:           number;
}

export interface BalanceSheetReport {
  reportName:                string;
  parameters:                Record<string, string>;
  asOfDate:                  string;
  assets:                    { accounts: BSAccountLine[]; total: number };
  liabilities:               { accounts: BSAccountLine[]; total: number };
  equity:                    { accounts: BSAccountLine[]; total: number };
  totalLiabilitiesAndEquity: number;
  isBalanced:                boolean;
}

export interface TBAccountLine {
  accountNumber: string;
  accountName:   string;
  accountType:   string;
  totalDebits:   number;
  totalCredits:  number;
  netBalance:    number;
}

export interface TrialBalanceReport {
  reportName: string;
  parameters: Record<string, string>;
  asOfDate:   string;
  accounts:   TBAccountLine[];
  totals: {
    totalDebits:  number;
    totalCredits: number;
    difference:   number;
    isBalanced:   boolean;
  };
}

export interface GLEntry {
  date:          string;
  entryNumber:   string;
  accountNumber: string;
  accountName:   string;
  description:   string;
  debit:         number;
  credit:        number;
}

export interface GLReport {
  reportName: string;
  parameters: Record<string, string>;
  entries:    GLEntry[];
}

// ─── Accounting — Budgets ─────────────────────────────────────────────────────

export type BudgetStatus = 'draft' | 'approved';

export interface BudgetLine {
  id:           string;
  accountId:    string;
  account?:     Account;
  fiscalPeriod: string;
  budgetAmount: number;
  notes?:       string;
}

export interface Budget {
  id:           string;
  budgetCode:   string;
  budgetName:   string;
  fiscalYear:   string;
  description?: string;
  status:       BudgetStatus;
  approvedAt?:  string;
  budgetLines:  BudgetLine[];
  createdAt:    string;
  updatedAt:    string;
}

export interface CreateBudgetDto {
  budgetCode:   string;
  budgetName:   string;
  fiscalYear:   string;
  description?: string;
}

export type UpdateBudgetDto = Partial<CreateBudgetDto>;

export interface CreateBudgetLineDto {
  accountId:    string;
  fiscalPeriod: string;
  budgetAmount: number;
  notes?:       string;
}

// ─── Accounting — Cash Flow ───────────────────────────────────────────────────

export type CashFlowScenario = 'optimistic' | 'realistic' | 'pessimistic';
export type CashFlowLineType = 'inflow' | 'outflow';

export interface CashFlowLine {
  id:          string;
  lineDate:    string;
  lineType:    CashFlowLineType;
  category:    string;
  amount:      number;
  description?: string;
  accountId?:  string;
  account?:    Account;
}

export interface CashFlowProjection {
  id:             string;
  projectionCode: string;
  projectionName: string;
  startDate:      string;
  endDate:        string;
  scenario:       CashFlowScenario;
  description?:   string;
  cashFlowLines:  CashFlowLine[];
  createdAt:      string;
  updatedAt:      string;
}

export interface CreateCashFlowProjectionDto {
  projectionCode: string;
  projectionName: string;
  startDate:      string;
  endDate:        string;
  scenario:       CashFlowScenario;
  description?:   string;
}

export type UpdateCashFlowProjectionDto = Partial<CreateCashFlowProjectionDto>;

export interface CreateCashFlowLineDto {
  lineDate:     string;
  lineType:     CashFlowLineType;
  category:     string;
  amount:       number;
  description?: string;
  accountId?:   string;
}

// ─── Administration — Tenant Configuration ────────────────────────────────────

export interface TenantSettings {
  id:                string;
  tenantId:          string;
  defaultUomSystem:  'metric' | 'imperial';
  volumeBaseUomId?:  string;
  massBaseUomId?:    string;
  lengthBaseUomId?:  string;
  areaBaseUomId?:    string;
  volumeBaseUom?:    UomUnit;
  massBaseUom?:      UomUnit;
  lengthBaseUom?:    UomUnit;
  areaBaseUom?:      UomUnit;
  updatedAt:         string;
}

export interface UpdateTenantSettingsDto {
  defaultUomSystem?: 'metric' | 'imperial';
  volumeBaseUomId?:  string;
  massBaseUomId?:    string;
  lengthBaseUomId?:  string;
  areaBaseUomId?:    string;
}
import apiClient from './client';

export interface ArInvoiceLine {
  id: string;
  lineNumber: number;
  itemId?: string;
  item?: { id: string; code: string; name: string };
  description?: string;
  quantity: string;
  uom?: string;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
  cogsAmount?: string;
}

export interface ArPayment {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: string;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
}

export interface ArInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customer?: { id: string; code: string; name: string; email?: string };
  soId?: string;
  salesOrder?: { id: string; soNumber: string };
  invoiceDate: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  currency: string;
  notes?: string;
  lines?: ArInvoiceLine[];
  payments?: ArPayment[];
  _count?: { lines: number; payments: number };
}

export interface ArAgingSummary {
  current:    { count: number; amount: number };
  days1to30:  { count: number; amount: number };
  days31to60: { count: number; amount: number };
  days90plus: { count: number; amount: number };
  total:      { count: number; amount: number };
}

export interface ArAging {
  asOf: string;
  summary: ArAgingSummary;
  detail: {
    current:    any[];
    days1to30:  any[];
    days31to60: any[];
    days90plus: any[];
  };
}

export interface ArKpis {
  invoiced:       number;
  collected:      number;
  pending:        number;
  overdue:        number;
  collectionRate: number;
}

export interface CreateArInvoiceLineDto {
  itemId?:          string;
  description?:     string;
  quantity:         number;
  uom?:             string;
  unitPrice:        number;
  discountPercent?: number;
  cogsAmount?:      number;
  revenueAccountId?: string;
  cogsAccountId?:    string;
}

export interface CreateArInvoiceDto {
  customerId:  string;
  soId?:       string;
  invoiceDate: string;
  dueDate:     string;
  currency?:   string;
  notes?:      string;
  lines:       CreateArInvoiceLineDto[];
}

export interface ApplyPaymentDto {
  paymentDate:    string;
  amount:         number;
  paymentMethod?: string;
  reference?:     string;
  notes?:         string;
}

export const arInvoicesApi = {
  getAll: (params?: { status?: string; customerId?: string; from?: string; to?: string }) =>
    // spec-026 envelope { arInvoices, count }; tolerate legacy bare array
    apiClient.get('/ar-invoices', { params }).then(r =>
      (Array.isArray(r.data) ? r.data : (r.data?.arInvoices ?? [])) as ArInvoice[],
    ),

  getById: (id: string) =>
    apiClient.get<ArInvoice>(`/ar-invoices/${id}`).then(r => r.data),

  getAging: () =>
    apiClient.get<ArAging>('/ar-invoices/aging').then(r => r.data),

  getKpis: () =>
    apiClient.get<ArKpis>('/ar-invoices/kpis').then(r => r.data),

  create: (dto: CreateArInvoiceDto) =>
    apiClient.post<ArInvoice>('/ar-invoices', dto).then(r => r.data),

  createFromSo: (soId: string) =>
    apiClient.post<ArInvoice>(`/ar-invoices/from-so/${soId}`).then(r => r.data),

  update: (id: string, dto: { dueDate?: string; notes?: string }) =>
    apiClient.patch<ArInvoice>(`/ar-invoices/${id}`, dto).then(r => r.data),

  send: (id: string) =>
    apiClient.patch(`/ar-invoices/${id}/send`).then(r => r.data),

  void: (id: string) =>
    apiClient.patch(`/ar-invoices/${id}/void`).then(r => r.data),

  applyPayment: (id: string, dto: ApplyPaymentDto) =>
    apiClient.post(`/ar-invoices/${id}/payments`, dto).then(r => r.data),

  remove: (id: string) =>
    apiClient.delete(`/ar-invoices/${id}`).then(r => r.data),
};
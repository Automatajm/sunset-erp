// ---- frontend/lib/api/notifications.ts ----
import apiClient from './client';

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'cancelled';
export type NotificationChannel = 'email' | 'in_app';
export type NotificationType =
  | 'so_confirmed'
  | 'po_created'
  | 'rfq_sent'
  | 'invoice_overdue'
  | 'stock_below_reorder';

export interface Notification {
  id: string;
  type: NotificationType | string;
  channel: NotificationChannel | string;
  status: NotificationStatus | string;
  recipientEmail: string | null;
  recipientName: string | null;
  subject: string;
  body: string;
  payload: Record<string, unknown> | null;
  retryCount: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationDrainResult {
  attempted: number;
  sent: number;
  failed: number;
}

function extractList(data: unknown): Notification[] {
  if (Array.isArray(data)) return data as Notification[];
  const d = data as Record<string, unknown>;
  if (d?.notifications && Array.isArray(d.notifications)) return d.notifications as Notification[];
  return [];
}

export const notificationsApi = {
  getAll: async (params?: { status?: string; type?: string; channel?: string }) => {
    const res = await apiClient.get('/notifications', { params });
    return extractList(res.data);
  },

  retry: async (id: string): Promise<{ message: string; notification: Notification }> => {
    const res = await apiClient.post(`/notifications/${id}/retry`);
    return res.data;
  },

  cancel: async (id: string): Promise<{ message: string; notification: Notification }> => {
    const res = await apiClient.post(`/notifications/${id}/cancel`);
    return res.data;
  },

  drain: async (): Promise<NotificationDrainResult> => {
    const res = await apiClient.post('/notifications/drain');
    return res.data;
  },
};

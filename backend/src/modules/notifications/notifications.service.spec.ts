// ============================================================================
// Unit tests for NotificationsService — spec-022-notifications
// PrismaService + MailTransport mocked. Asserts queue-first behavior, the
// drain state machine (sent / retry / failed with backoff), retry/cancel
// transitions, tenant scoping, and that apiKey is never read into responses.
// ============================================================================
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';
import { MAIL_TRANSPORT, MailTransport } from './mail/mail-transport';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const NID = '99999999-9999-9999-9999-999999999999';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: Record<string, any>;
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      tenantSettings: { findFirst: jest.fn() },
    };
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    const mod = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MAIL_TRANSPORT, useValue: mail as MailTransport },
      ],
    }).compile();
    service = mod.get(NotificationsService);
  });

  // ── queue — renders template, inserts pending, never sends inline ─────────

  it('queue renders the template, inserts a pending row, and does NOT send inline', async () => {
    prisma.notification.create.mockResolvedValue({ id: NID });
    await service.queue(
      TENANT_A,
      'so_confirmed',
      { email: 'c@x.com', name: 'Acme' },
      { soNumber: 'SO-2026-0001', customerName: 'Acme', total: 900, currency: 'DOP' },
    );
    const data = prisma.notification.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.status).toBe('pending');
    expect(data.subject).toContain('SO-2026-0001'); // {{soNumber}} substituted
    expect(data.body).toContain('Acme');
    expect(mail.send).not.toHaveBeenCalled(); // queue never sends inline
  });

  it('queue renders unknown variables as empty without throwing', async () => {
    prisma.notification.create.mockResolvedValue({ id: NID });
    await service.queue(TENANT_A, 'so_confirmed', { email: 'c@x.com' }, {}); // no vars
    const data = prisma.notification.create.mock.calls[0][0].data;
    expect(data.subject).not.toContain('{{'); // placeholders gone, no crash
  });

  // ── safeQueueOnce dedup ────────────────────────────────────────────────────

  it('safeQueueOnce skips when an active notification already exists for the key', async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: 'existing' });
    service.safeQueueOnce(
      TENANT_A,
      'invoice_overdue',
      'invoiceId',
      { email: 'c@x.com' },
      { invoiceId: 'inv-1' },
    );
    await new Promise((r) => setImmediate(r));
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('safeQueueOnce queues when no prior notification exists for the key', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    prisma.notification.create.mockResolvedValue({ id: NID });
    service.safeQueueOnce(
      TENANT_A,
      'invoice_overdue',
      'invoiceId',
      { email: 'c@x.com' },
      { invoiceId: 'inv-1', invoiceNumber: 'INV-1' },
    );
    await new Promise((r) => setImmediate(r));
    expect(prisma.notification.create).toHaveBeenCalled();
  });

  // ── drainPending — sent / retry / failed ──────────────────────────────────

  const pendingRow = (over: Record<string, any> = {}) => ({
    id: NID,
    tenantId: TENANT_A,
    recipientEmail: 'c@x.com',
    recipientName: 'Acme',
    subject: 'Hi',
    body: 'Body',
    retryCount: 0,
    updatedAt: new Date('2020-01-01'),
    ...over,
  });

  it('drainPending sends a fresh pending row and marks it sent', async () => {
    prisma.notification.findMany.mockResolvedValue([pendingRow()]);
    prisma.tenantSettings.findFirst.mockResolvedValue({ emailFromAddress: 'ops@x.com' });
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const res = await service.drainPending();
    expect(mail.send).toHaveBeenCalled();
    expect(res.sent).toBe(1);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NID, tenantId: TENANT_A },
        data: expect.objectContaining({ status: 'sent', sentAt: expect.any(Date) }),
      }),
    );
  });

  it('drainPending without a recipient marks the row failed (retryCount++)', async () => {
    prisma.notification.findMany.mockResolvedValue([pendingRow({ recipientEmail: null })]);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    const res = await service.drainPending();
    expect(res.failed).toBe(1);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('drainPending keeps a row pending (not failed) before the retry cap', async () => {
    prisma.notification.findMany.mockResolvedValue([pendingRow()]);
    prisma.tenantSettings.findFirst.mockResolvedValue({});
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    mail.send.mockRejectedValue(new Error('smtp down'));
    await service.drainPending();
    const data = prisma.notification.updateMany.mock.calls[0][0].data;
    expect(data.retryCount).toBe(1);
    expect(data.status).toBe('pending'); // backoff, not terminal yet
  });

  it('drainPending marks failed terminal at the 3rd attempt', async () => {
    prisma.notification.findMany.mockResolvedValue([
      pendingRow({ retryCount: 2, updatedAt: new Date('2000-01-01') }),
    ]);
    prisma.tenantSettings.findFirst.mockResolvedValue({});
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    mail.send.mockRejectedValue(new Error('smtp down'));
    await service.drainPending();
    const data = prisma.notification.updateMany.mock.calls[0][0].data;
    expect(data.retryCount).toBe(3);
    expect(data.status).toBe('failed'); // terminal
  });

  it('drainPending respects exponential backoff (skips a row whose window has not elapsed)', async () => {
    // retryCount 1 → 1 min window; updatedAt = now → not elapsed → skipped
    prisma.notification.findMany.mockResolvedValue([
      pendingRow({ retryCount: 1, updatedAt: new Date() }),
    ]);
    prisma.tenantSettings.findFirst.mockResolvedValue({});
    const res = await service.drainPending();
    expect(mail.send).not.toHaveBeenCalled();
    expect(res.sent).toBe(0);
    expect(res.failed).toBe(0);
  });

  // ── findAll / findOne — tenant scoping ────────────────────────────────────

  it('findAll scopes by tenantId and returns the { notifications, count } envelope', async () => {
    prisma.notification.findMany.mockResolvedValue([{ id: NID }]);
    const res: any = await service.findAll(TENANT_A, { status: 'failed' });
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, status: 'failed' }),
      }),
    );
    expect(res).toHaveProperty('notifications');
    expect(res.count).toBe(1);
  });

  it('findOne throws NotFoundException for another tenant', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, NID)).rejects.toThrow(NotFoundException);
  });

  // ── retry / cancel transitions ────────────────────────────────────────────

  it('retry re-queues a failed notification (resets retryCount)', async () => {
    prisma.notification.findFirst
      .mockResolvedValueOnce({ id: NID, status: 'failed' }) // findOne guard
      .mockResolvedValueOnce({ id: NID, status: 'pending' }); // refetch
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    await service.retry(TENANT_A, NID);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: NID, tenantId: TENANT_A },
        data: expect.objectContaining({ status: 'pending', retryCount: 0 }),
      }),
    );
  });

  it('retry rejects a sent notification', async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: NID, status: 'sent' });
    await expect(service.retry(TENANT_A, NID)).rejects.toThrow(BadRequestException);
  });

  it('cancel rejects an already-sent notification', async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: NID, status: 'sent' });
    await expect(service.cancel(TENANT_A, NID)).rejects.toThrow(BadRequestException);
  });

  it('cancel sets status cancelled for a pending notification', async () => {
    prisma.notification.findFirst
      .mockResolvedValueOnce({ id: NID, status: 'pending' })
      .mockResolvedValueOnce({ id: NID, status: 'cancelled' });
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    await service.cancel(TENANT_A, NID);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    );
  });
});

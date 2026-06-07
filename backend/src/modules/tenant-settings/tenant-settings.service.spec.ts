// ============================================================================
// Unit tests for TenantSettingsService — spec-027-admin-cluster
// PrismaService mocked. [GAP] = unchecked acceptance criterion.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TenantSettingsService } from './tenant-settings.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

describe('TenantSettingsService', () => {
  let service: TenantSettingsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      tenantSettings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      currency: { findFirst: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [TenantSettingsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(TenantSettingsService);
  });

  it('getOrCreate returns existing settings without creating', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue({ tenantId: TENANT, baseCurrency: 'DOP' });
    const res = await service.getOrCreate(TENANT);
    expect(res.baseCurrency).toBe('DOP');
    expect(prisma.tenantSettings.create).not.toHaveBeenCalled();
  });

  it('getOrCreate lazily creates settings (metric default) when none exist', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue(null);
    prisma.tenantSettings.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...data }),
    );
    const res: any = await service.getOrCreate(TENANT);
    expect(res.defaultUomSystem).toBe('metric');
  });

  it('update persists scoped to the tenant with the actor stamp', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue({ tenantId: TENANT });
    prisma.currency.findFirst.mockResolvedValue({ code: 'DOP' });
    prisma.tenantSettings.update.mockImplementation(({ where, data }: any) =>
      Promise.resolve({ ...where, ...data }),
    );
    await service.update(TENANT, USER, { defaultUomSystem: 'imperial' } as any);
    expect(prisma.tenantSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT },
        data: expect.objectContaining({ updatedBy: USER }),
      }),
    );
  });

  it('[GAP] update catalog-validates baseCurrency (404 on unknown code)', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue({ tenantId: TENANT });
    prisma.currency.findFirst.mockResolvedValue(null); // not in catalog
    await expect(service.update(TENANT, USER, { baseCurrency: 'XXX' } as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update accepts a valid baseCurrency from the catalog', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue({ tenantId: TENANT });
    prisma.currency.findFirst.mockResolvedValue({ code: 'USD' });
    prisma.tenantSettings.update.mockImplementation(({ data }: any) => Promise.resolve(data));
    const res: any = await service.update(TENANT, USER, { baseCurrency: 'USD' } as any);
    expect(res.baseCurrency).toBe('USD');
  });

  it('getSystemUoms returns the configured-only flat list', async () => {
    prisma.tenantSettings.findUnique.mockResolvedValue({
      tenantId: TENANT,
      volumeBaseUom: { id: 'v' },
      massBaseUom: { id: 'm' },
      lengthBaseUom: null,
      areaBaseUom: null,
      countBaseUom: null,
      timeBaseUom: null,
    });
    const res = await service.getSystemUoms(TENANT);
    expect(res.list).toHaveLength(2);
  });
});

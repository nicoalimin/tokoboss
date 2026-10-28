import { describe, expect, it } from 'vitest';
import {
  DisconnectConnectionBodySchema,
  IntegrationActivityItemDtoSchema,
  IntegrationActivityQuerySchema,
  UpdateConnectionControlsBodySchema,
} from '@tokoboss/contracts';

/**
 * US18 / RFC 07 row 6: Story 18 contract validation — store controls body
 * (at least one flag), PUTUSKAN disconnect guard and the activity feed DTO.
 * Lives in web because @tokoboss/contracts has no test runner (CoS
 * decision 2026-10-28). Pure Zod parsing; no fetch, no React.
 */

const activityItem = {
  id: 'evt-1',
  action: 'integration.controls_updated',
  connectionId: 'conn-1',
  provider: 'shopee',
  storeName: 'Toko Maju',
  actorId: 'user-1',
  occurredAt: '2026-10-28T11:33:00.000Z',
  occurredAtWib: '28 Okt 2026, 18.33 WIB',
  summary: 'Sinkronisasi stok dijeda',
};

describe('UpdateConnectionControlsBodySchema', () => {
  it('accepts any single flag and rejects an empty or unknown body', () => {
    expect(
      UpdateConnectionControlsBodySchema.safeParse({
        orderImportEnabled: false,
      }).success
    ).toBe(true);
    expect(
      UpdateConnectionControlsBodySchema.safeParse({
        inventorySyncEnabled: true,
        reconcileNow: true,
      }).success
    ).toBe(true);
    expect(UpdateConnectionControlsBodySchema.safeParse({}).success).toBe(
      false
    );
    expect(
      UpdateConnectionControlsBodySchema.safeParse({ orderImportEnabled: 'no' })
        .success
    ).toBe(false);
    expect(
      UpdateConnectionControlsBodySchema.safeParse({
        reconcileNow: true,
        accessToken: 'x',
      }).success
    ).toBe(false);
  });
});

describe('DisconnectConnectionBodySchema', () => {
  it('accepts no confirmation or exactly PUTUSKAN, nothing else', () => {
    expect(DisconnectConnectionBodySchema.safeParse({}).success).toBe(true);
    expect(
      DisconnectConnectionBodySchema.parse({ confirmationText: 'PUTUSKAN' })
    ).toEqual({ confirmationText: 'PUTUSKAN' });
    for (const confirmationText of ['putuskan', 'PUTUSKAN ', '', 'HAPUS']) {
      expect(
        DisconnectConnectionBodySchema.safeParse({ confirmationText }).success
      ).toBe(false);
    }
    expect(
      DisconnectConnectionBodySchema.safeParse({ reason: 'x' }).success
    ).toBe(false);
  });
});

describe('IntegrationActivityItemDtoSchema', () => {
  it('parses a WIB activity row, rejects unknown actions and extra fields', () => {
    expect(IntegrationActivityItemDtoSchema.parse(activityItem)).toEqual(
      activityItem
    );
    expect(
      IntegrationActivityItemDtoSchema.safeParse({
        ...activityItem,
        connectionId: null,
        provider: null,
        storeName: null,
        actorId: null,
      }).success
    ).toBe(true);
    expect(
      IntegrationActivityItemDtoSchema.safeParse({
        ...activityItem,
        action: 'integration.deleted',
      }).success
    ).toBe(false);
    expect(
      IntegrationActivityItemDtoSchema.safeParse({
        ...activityItem,
        buyerPhone: '0812',
      }).success
    ).toBe(false);
    expect(IntegrationActivityQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      IntegrationActivityQuerySchema.safeParse({ limit: '51' }).success
    ).toBe(false);
  });
});

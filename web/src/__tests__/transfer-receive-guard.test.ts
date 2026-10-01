import { describe, expect, it } from 'vitest';
import { canReceiveSent } from '../components/transfer/TransfersPanel';

/**
 * Pure receive guard (UTA-141) — no DOM.
 */
describe('canReceiveSent (UTA-141)', () => {
  it('allows admin/manager on sent transfers', () => {
    expect(canReceiveSent('admin', 'sent')).toBe(true);
    expect(canReceiveSent('manager', 'sent')).toBe(true);
  });

  it('rejects staff and non-sent statuses', () => {
    expect(canReceiveSent('staff', 'sent')).toBe(false);
    expect(canReceiveSent('admin', 'draft')).toBe(false);
    expect(canReceiveSent('manager', 'received')).toBe(false);
    expect(canReceiveSent('admin', 'cancelled')).toBe(false);
  });
});

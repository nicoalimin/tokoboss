import { describe, expect, it } from 'vitest';
import { canCancelTransfer } from '../components/transfer/TransfersPanel';

/**
 * Pure cancel guard (UTA-142) — no DOM.
 */
describe('canCancelTransfer (UTA-142)', () => {
  it('allows admin/manager on draft or sent transfers', () => {
    expect(canCancelTransfer('admin', 'draft')).toBe(true);
    expect(canCancelTransfer('manager', 'draft')).toBe(true);
    expect(canCancelTransfer('admin', 'sent')).toBe(true);
    expect(canCancelTransfer('manager', 'sent')).toBe(true);
  });

  it('rejects staff and terminal statuses', () => {
    expect(canCancelTransfer('staff', 'draft')).toBe(false);
    expect(canCancelTransfer('staff', 'sent')).toBe(false);
    expect(canCancelTransfer('admin', 'received')).toBe(false);
    expect(canCancelTransfer('manager', 'cancelled')).toBe(false);
  });
});

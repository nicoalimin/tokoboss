import { describe, expect, it } from 'vitest';
import { switchTarget } from '@/components/workspace/switch-target';

describe('switchTarget (US29 / RFC 02 row 40)', () => {
  it('keeps only the top-level section for open sections', () => {
    expect(switchTarget('/w/ws_a/produk', 'ws_b', 'staff')).toBe(
      '/w/ws_b/produk'
    );
    expect(
      switchTarget('/w/ws_a/stok/var_123?tab=ledger', 'ws_b', 'manager')
    ).toBe('/w/ws_b/stok');
    expect(switchTarget('/w/ws_a/low-stock#top', 'ws b', 'staff')).toBe(
      '/w/ws%20b/low-stock'
    );
  });

  it('gates admin-only sections by the target role', () => {
    expect(switchTarget('/w/ws_a/team', 'ws_b', 'admin')).toBe('/w/ws_b/team');
    expect(switchTarget('/w/ws_a/team/invites', 'ws_b', 'manager')).toBe(
      '/w/ws_b/dashboard'
    );
    expect(switchTarget('/w/ws_a/billing', 'ws_b', 'admin')).toBe(
      '/w/ws_b/billing'
    );
    expect(switchTarget('/w/ws_a/billing', 'ws_b', 'staff')).toBe(
      '/w/ws_b/dashboard'
    );
  });

  it('falls back to dashboard when no section can be read', () => {
    expect(switchTarget(null, 'ws_b', 'admin')).toBe('/w/ws_b/dashboard');
    expect(switchTarget(undefined, 'ws_b', 'admin')).toBe('/w/ws_b/dashboard');
    expect(switchTarget('/pilih-workspace', 'ws_b', 'admin')).toBe(
      '/w/ws_b/dashboard'
    );
    expect(switchTarget('/w/ws_a', 'ws_b', 'staff')).toBe('/w/ws_b/dashboard');
    expect(switchTarget('/w/ws_a/Produk', 'ws_b', 'staff')).toBe(
      '/w/ws_b/dashboard'
    );
  });
});

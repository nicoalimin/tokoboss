import { describe, expect, it } from 'vitest';
import {
  homeModules,
  isAuthRoute,
  isNavActive,
  visibleNavItems,
} from '@/components/shell/nav-items';

describe('shell nav (UTA-113)', () => {
  it('keeps auth pages outside the shell', () => {
    expect(isAuthRoute('/sign-in')).toBe(true);
    expect(isAuthRoute('/forgot-password')).toBe(true);
    expect(isAuthRoute('/reset-password')).toBe(true);
    expect(isAuthRoute('/accept-invite')).toBe(true);
    expect(isAuthRoute('/')).toBe(false);
    expect(isAuthRoute('/produk')).toBe(false);
    expect(isAuthRoute('/sign-inx')).toBe(false);
  });

  it('highlights the active route', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/produk', '/')).toBe(false);
    expect(isNavActive('/produk/bundles', '/produk')).toBe(true);
    expect(isNavActive('/ledger/abc', '/ledger')).toBe(true);
    expect(isNavActive('/sessions', '/profil')).toBe(true);
    expect(isNavActive('/produkx', '/produk')).toBe(false);
    expect(isNavActive('/gudang', '/gudang')).toBe(true);
    expect(isNavActive('/transfer', '/transfer')).toBe(true);
    expect(isNavActive('/stok-tipis', '/stok-tipis')).toBe(true);
  });

  it('gates Tim & Akses to admins once the role is known', () => {
    const hrefs = (role: string | null) =>
      visibleNavItems(role).map((i) => i.href);
    expect(hrefs('admin')).toContain('/team');
    expect(hrefs('manager')).not.toContain('/team');
    expect(hrefs('staff')).not.toContain('/team');
    expect(hrefs(null)).toContain('/team');
  });

  it('lists every module except Beranda as home cards', () => {
    const hrefs = homeModules('admin').map((i) => i.href);
    expect(hrefs).toEqual([
      '/produk',
      '/ledger',
      '/stok-tipis',
      '/gudang',
      '/transfer',
      '/team',
      '/pengaturan',
      '/profil',
    ]);
  });
});

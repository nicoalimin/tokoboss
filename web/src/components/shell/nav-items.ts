import { canManageTeam } from '@/lib/role-matrix';

/**
 * Sidebar navigation model for the web app shell (UTA-113).
 *
 * Pure data + helpers so the shell chrome stays testable without a DOM.
 * The server remains the security boundary; role gating here is chrome only.
 */
export interface ShellNavItem {
  href: string;
  label: string;
  icon: string;
  testId: string;
  /** When true, only shown to roles that may manage the team (Admin). */
  adminOnly?: boolean;
}

export const SHELL_NAV_ITEMS: readonly ShellNavItem[] = [
  { href: '/', label: 'Beranda', icon: '🏠', testId: 'nav-beranda' },
  { href: '/produk', label: 'Produk & Stok', icon: '📦', testId: 'nav-produk' },
  { href: '/ledger', label: 'Buku stok', icon: '📒', testId: 'nav-ledger' },
  {
    href: '/team',
    label: 'Tim & Akses',
    icon: '👥',
    testId: 'nav-team',
    adminOnly: true,
  },
  {
    href: '/pengaturan',
    label: 'Pengaturan',
    icon: '⚙️',
    testId: 'nav-pengaturan',
  },
  { href: '/profil', label: 'Profil', icon: '🙂', testId: 'nav-profil' },
];

/** Routes rendered without the sidebar (sign-in and account recovery). */
export const AUTH_ROUTE_PREFIXES: readonly string[] = [
  '/sign-in',
  '/forgot-password',
  '/reset-password',
  '/accept-invite',
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when the path is an auth page that must stay outside the shell. */
export function isAuthRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return AUTH_ROUTE_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/** True when the sidebar item for `href` should be highlighted. */
export function isNavActive(
  pathname: string | null | undefined,
  href: string
): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  if (href === '/profil') {
    return (
      matchesPrefix(pathname, '/profil') ||
      matchesPrefix(pathname, '/profile') ||
      matchesPrefix(pathname, '/sessions')
    );
  }
  return matchesPrefix(pathname, href);
}

/**
 * Items visible for a role. Unknown role (loading / signed out) shows all
 * entries so first-run flows keep working, matching the old AppNav gate.
 */
export function visibleNavItems(
  role: string | null | undefined
): ShellNavItem[] {
  const known = role !== null && role !== undefined;
  return SHELL_NAV_ITEMS.filter(
    (item) => !item.adminOnly || !known || canManageTeam(role)
  );
}

/** Home cards: every module except Beranda itself. */
export function homeModules(role: string | null | undefined): ShellNavItem[] {
  return visibleNavItems(role).filter((item) => item.href !== '/');
}

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

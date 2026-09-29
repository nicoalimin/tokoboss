'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMembership } from '@/lib/use-membership';
import {
  ROLE_LABELS,
  isAuthRoute,
  isNavActive,
  visibleNavItems,
} from './nav-items';

/**
 * Web app shell (UTA-113): persistent left sidebar on desktop, slide-out
 * drawer on mobile. Auth pages render bare (no sidebar). Replaces the old
 * bottom-left `•••` AppNav overflow menu.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (isAuthRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <div data-testid="app-shell" className="min-h-screen lg:flex">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-fixed flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="Buka menu"
          aria-expanded={drawerOpen}
          data-testid="shell-menu-button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-neutral-300 bg-white text-lg text-neutral-800 hover:bg-neutral-100"
        >
          <span aria-hidden>☰</span>
        </button>
        <span className="font-bold text-neutral-900">📦 TokoBoss</span>
        <span className="w-[44px]" aria-hidden />
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-60 lg:flex-none lg:flex-col lg:border-r lg:border-neutral-200 lg:bg-white">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div
          className="fixed inset-0 z-modal lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu navigasi"
        >
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-neutral-900/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-lg">
            <SidebarContent pathname={pathname} />
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SidebarContent({ pathname }: { pathname: string | null }) {
  const { membership, signedIn, loading } = useMembership();
  const items = visibleNavItems(membership?.role ?? null);
  const roleLabel = membership
    ? (ROLE_LABELS[membership.role] ?? membership.role)
    : null;

  return (
    <nav
      aria-label="Navigasi utama"
      data-testid="shell-sidebar"
      className="flex h-full flex-col gap-1 p-3"
    >
      <div className="mb-2 flex items-center gap-3 px-2 pb-3 pt-1">
        <div
          className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-primary-100 text-lg"
          aria-hidden
        >
          📦
        </div>
        <div className="min-w-0">
          <strong className="block text-sm text-neutral-900">TokoBoss</strong>
          <span className="block truncate text-xs text-neutral-500">
            {loading
              ? 'Memuat…'
              : signedIn
                ? `Workspace aktif${roleLabel ? ` · ${roleLabel}` : ''}`
                : 'Belum masuk'}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                data-testid={item.testId}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'flex min-h-[44px] items-center gap-3 rounded-xl bg-primary-50 px-3 py-2 text-sm font-bold text-primary-700'
                    : 'flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                }
              >
                <span aria-hidden className="w-5 text-center">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto border-t border-neutral-100 pt-3">
        {signedIn ? (
          <Link
            href="/sessions"
            className="block rounded-lg px-3 py-2 text-xs text-neutral-500 hover:bg-neutral-100"
          >
            Sesi aktif
          </Link>
        ) : (
          <Link
            href="/sign-in"
            data-testid="nav-sign-in"
            className="block rounded-lg px-3 py-2 text-sm font-semibold text-primary-600 hover:bg-neutral-100"
          >
            Masuk
          </Link>
        )}
      </div>
    </nav>
  );
}

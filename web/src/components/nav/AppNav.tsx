'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getProfileCopy } from '@/lib/profile-copy';
import { canManageTeam } from '@/lib/role-matrix';
import { useMembership } from '@/lib/use-membership';

/**
 * Bottom-left overflow navigation (UTA-73 entry, UTA-74 role gate).
 *
 * - Desktop shows the `•••` ellipsis button; mobile shows the `Lainnya`
 *   label next to it (same button, responsive text).
 * - The menu links to Produk & Stok (`/produk`), Pengaturan (`/pengaturan`), Profil (`/profil`),
 *   Active sessions (`/sessions`), Team & Access (`/team`), and Sign in
 *   (`/sign-in`). Rendered globally from the root layout so every screen
 *   has the mockup entry point.
 * - Role gate: the Team & Access entry hides once the signed-in role is
 *   known non-Admin (Manager/Staff keep Pengaturan + Profil + matrix
 *   visibility; the `/team` deep link itself renders no-access). While the
 *   membership is loading or the visitor is signed out, all entries show
 *   so fixture and first-run flows keep working. The server stays the
 *   security boundary — this is chrome only.
 * - No secrets, no session reads beyond the opaque membership fetch.
 */
export function AppNav() {
  const copy = getProfileCopy('en');
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { membership } = useMembership();
  const hideTeam = membership !== null && !canManageTeam(membership.role);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const links = [
    {
      href: '/produk',
      label: copy.navProducts,
      testId: 'nav-link-produk',
    },
    {
      href: '/pengaturan',
      label: copy.navSettings,
      testId: 'nav-link-settings',
    },
    { href: '/profil', label: copy.navProfile, testId: 'nav-link-profil' },
    { href: '/sessions', label: copy.navSessions, testId: 'nav-link-sessions' },
    ...(hideTeam
      ? []
      : [{ href: '/team', label: copy.navTeam, testId: 'nav-link-team' }]),
    { href: '/sign-in', label: copy.navSignIn, testId: 'nav-link-sign-in' },
  ];

  return (
    <div
      ref={menuRef}
      data-testid="app-nav"
      className="fixed bottom-4 left-4 z-fixed"
    >
      {open ? (
        <nav
          aria-label={copy.navMenuLabel}
          data-testid="nav-menu"
          className="mb-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md"
        >
          <ul className="divide-y divide-neutral-100">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  data-testid={link.testId}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 min-h-[44px] text-sm font-medium text-neutral-800 hover:bg-neutral-100"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.navMenuLabel}
        data-testid="nav-more-button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-3 min-h-[44px] text-sm font-semibold text-neutral-800 shadow-md hover:bg-neutral-100"
      >
        <span aria-hidden>•••</span>
        <span className="sm:hidden">{copy.navMoreLabel}</span>
        <span className="hidden sm:inline sr-only">{copy.navMenuLabel}</span>
      </button>
    </div>
  );
}

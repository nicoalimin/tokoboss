'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth-client';

/**
 * Account footer for WorkspaceSwitcher (US29 / RFC 02 row 40 slice b).
 * Profil / Pengaturan / Sesi aktif / Keluar. Invites count = later slice.
 */

export function WorkspaceSwitcherAccountFooter({
  currentWorkspaceId,
  onNavigate,
}: Readonly<{
  currentWorkspaceId: string;
  onNavigate: () => void;
}>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pengaturan = `/w/${encodeURIComponent(currentWorkspaceId)}/pengaturan`;

  async function onKeluar() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      onNavigate();
      router.replace('/sign-in');
    }
  }

  const item =
    'block min-h-[44px] rounded-lg px-2 py-2 text-sm text-neutral-800 hover:bg-neutral-100';

  return (
    <div className="mt-2 space-y-0.5 border-t border-neutral-100 pt-2">
      <Link
        href="/akun/profil"
        role="menuitem"
        onClick={onNavigate}
        className={item}
      >
        Profil
      </Link>
      <Link
        href={pengaturan}
        role="menuitem"
        onClick={onNavigate}
        className={item}
      >
        Pengaturan
      </Link>
      <Link
        href="/akun/sesi"
        role="menuitem"
        onClick={onNavigate}
        className={item}
      >
        Sesi aktif
      </Link>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => void onKeluar()}
        className={`${item} w-full text-left font-semibold disabled:opacity-60`}
      >
        Keluar
      </button>
    </div>
  );
}

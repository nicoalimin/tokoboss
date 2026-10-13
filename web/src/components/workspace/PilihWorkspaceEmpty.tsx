'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InviteView } from '@tokoboss/contracts';
import { signOut } from '@/lib/auth-client';

/**
 * Zero-workspace state for `/pilih-workspace` (US29 / RFC 02 row 39 slice 3a).
 *
 * Pending invites get a Terima link to the token-gated `/accept-invite` page;
 * otherwise "Belum ada workspace aktif" plus Keluar. Deactivated workspaces
 * are never named (invites carry no workspace name).
 */

const ROLE_LABEL: Record<InviteView['role'], string> = {
  admin: 'Admin',
  manager: 'Manajer',
  staff: 'Staf',
};

function daysLeft(expiresAt: string): number {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function PilihWorkspaceEmpty({
  invites,
}: Readonly<{ invites: InviteView[] }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onKeluar() {
    setBusy(true);
    try {
      await signOut();
    } finally {
      router.replace('/sign-in');
    }
  }

  return (
    <div data-testid="pilih-workspace-empty" className="space-y-4 text-center">
      <h2 className="text-lg font-semibold text-neutral-900">
        Belum ada workspace aktif
      </h2>
      <p className="text-sm text-neutral-600">
        Akun kamu sudah masuk, tapi belum tergabung di workspace mana pun yang
        aktif. Minta Admin toko mengundang kamu, atau terima undangan di bawah.
      </p>
      {invites.length > 0 ? (
        <ul className="space-y-2 text-left">
          {invites.map((inv) => (
            <li
              key={inv.id}
              className="flex min-h-[44px] items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
            >
              <span className="min-w-0 flex-1 text-sm text-neutral-700">
                Undangan sebagai {ROLE_LABEL[inv.role]} · berlaku{' '}
                {daysLeft(inv.expiresAt)} hari lagi
              </span>
              <Link
                href="/accept-invite"
                className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Terima
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void onKeluar()}
        className="min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 disabled:opacity-60"
      >
        Keluar
      </button>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AccessibleWorkspaceView,
  InviteView,
  MeWorkspacesResponse,
} from '@tokoboss/contracts';
import { WorkspaceCard } from '@/components/workspace/WorkspaceCard';
import { PilihWorkspaceEmpty } from '@/components/workspace/PilihWorkspaceEmpty';

/** US29 / RFC 02 row 39 — picker client (empty/Keluar/invites = slice 3b). */

function enterHref(workspaceId: string, next: string | null): string {
  const base = `/w/${encodeURIComponent(workspaceId)}`;
  const bad =
    !next ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.startsWith('/akun/') ||
    next.startsWith('/accept-invite') ||
    next.startsWith('/sign-in') ||
    next.startsWith('/pilih-workspace') ||
    next.startsWith('/go/');
  if (bad) return `${base}/dashboard`;
  const m = /^\/w\/[^/]+(\/.*)?$/.exec(next);
  if (m) return `${base}${m[1] && m[1].length > 1 ? m[1] : '/dashboard'}`;
  return `${base}${next}`;
}

export function PilihWorkspaceClient({
  highlight,
  next,
}: Readonly<{ highlight: string | null; next: string | null }>) {
  const router = useRouter();
  const [list, setList] = useState<AccessibleWorkspaceView[] | null>(null);
  const [invites, setInvites] = useState<InviteView[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void (async () => {
      const res = await fetch('/api/me/workspaces', {
        credentials: 'same-origin',
      });
      if (res.status === 401) {
        const sp = new URLSearchParams();
        if (highlight) sp.set('highlight', highlight);
        if (next) sp.set('next', next);
        const back = `/pilih-workspace${sp.size ? `?${sp}` : ''}`;
        router.replace(`/sign-in?next=${encodeURIComponent(back)}`);
        return;
      }
      if (!res.ok) {
        if (!gone) setErr('Gagal memuat daftar workspace.');
        return;
      }
      const body = (await res.json()) as MeWorkspacesResponse;
      if (!gone) {
        setList(body.workspaces);
        setInvites(body.pendingInvites);
      }
    })();
    return () => {
      gone = true;
    };
  }, [highlight, next, router]);

  const shown = useMemo(() => {
    if (!list) return [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((w) => w.name.toLowerCase().includes(needle));
  }, [list, q]);

  if (list === null && err === null) {
    return <p className="text-sm text-neutral-600">Memuat…</p>;
  }

  if (list !== null && list.length === 0 && err === null) {
    return <PilihWorkspaceEmpty invites={invites} />;
  }

  return (
    <div data-testid="pilih-workspace" className="space-y-4">
      {err ? (
        <p
          role="alert"
          className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700"
        >
          {err}
        </p>
      ) : null}
      {(list?.length ?? 0) > 5 ? (
        <input
          id="pilih-ws-search"
          type="search"
          aria-label="Cari workspace"
          placeholder="Ketik nama toko…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base"
        />
      ) : null}
      <div className="space-y-2">
        {shown.map((w) => (
          <WorkspaceCard
            key={w.workspaceId}
            workspace={w}
            highlighted={highlight === w.workspaceId}
            onSelect={(id) => router.push(enterHref(id, next))}
          />
        ))}
      </div>
    </div>
  );
}

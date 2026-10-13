'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AccessibleWorkspaceView,
  MeWorkspacesResponse,
} from '@tokoboss/contracts';
import { WorkspaceCard } from '@/components/workspace/WorkspaceCard';
import { WorkspaceSwitcherAccountFooter } from '@/components/workspace/WorkspaceSwitcherAccountFooter';

/**
 * Desktop identity switcher — workspace list + account footer (US29 / RFC 02 row 40).
 * Invites count / section-preserving switch = later slices.
 * AppShell mount = row 41. Draft-dirty confirm = out of scope.
 */

export function WorkspaceSwitcher({
  currentWorkspaceId,
  displayName,
  roleLabel,
}: Readonly<{
  currentWorkspaceId: string;
  displayName: string;
  roleLabel?: string | null;
}>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<AccessibleWorkspaceView[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let gone = false;
    void (async () => {
      const res = await fetch('/api/me/workspaces', {
        credentials: 'same-origin',
      });
      if (!res.ok || gone) return;
      const body = (await res.json()) as MeWorkspacesResponse;
      if (!gone) setList(body.workspaces);
    })();
    return () => {
      gone = true;
    };
  }, [open]);

  function onSelect(id: string) {
    setOpen(false);
    if (id === currentWorkspaceId) return;
    router.push(`/w/${encodeURIComponent(id)}/dashboard`);
  }

  return (
    <div className="relative" data-testid="workspace-switcher">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-neutral-100"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-neutral-900">
            {displayName}
          </span>
          {roleLabel ? (
            <span className="block truncate text-xs text-neutral-500">
              {roleLabel}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="text-neutral-500">
          ⋯
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-modal mb-2 w-72 max-w-[85vw] rounded-xl border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Workspace
          </p>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {list === null ? (
              <p className="px-2 py-2 text-sm text-neutral-500">Memuat…</p>
            ) : (
              list.map((w) => (
                <WorkspaceCard
                  key={w.workspaceId}
                  workspace={w}
                  current={w.workspaceId === currentWorkspaceId}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
          <WorkspaceSwitcherAccountFooter
            currentWorkspaceId={currentWorkspaceId}
            onNavigate={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

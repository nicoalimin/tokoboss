'use client';

import { useEffect, useState } from 'react';
import type { MeWorkspacesResponse } from '@tokoboss/contracts';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';

/**
 * Sidebar identity block (US29 / RFC 02 row 41 slice a): resolves the current
 * workspace name once and renders the WorkspaceSwitcher. Falls back to
 * "Workspace aktif" while loading or when the name is unknown. Mounted in
 * AppShell by row 41 slice b.
 */
export function ShellIdentity({
  workspaceId,
  roleLabel,
}: Readonly<{
  workspaceId: string;
  roleLabel?: string | null;
}>) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const res = await fetch('/api/me/workspaces', {
          credentials: 'same-origin',
        });
        if (!res.ok || gone) return;
        const body = (await res.json()) as MeWorkspacesResponse;
        if (gone) return;
        const current = body.workspaces.find(
          (w) => w.workspaceId === workspaceId
        );
        setName(current?.name ?? null);
      } catch {
        // Chrome stays usable with the fallback label.
      }
    })();
    return () => {
      gone = true;
    };
  }, [workspaceId]);

  return (
    <WorkspaceSwitcher
      currentWorkspaceId={workspaceId}
      displayName={name ?? 'Workspace aktif'}
      roleLabel={roleLabel}
    />
  );
}

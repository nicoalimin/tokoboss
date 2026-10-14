'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getMyMembership, type MyMembershipView } from '@/lib/team-client';

export interface MembershipState {
  membership: MyMembershipView | null;
  loading: boolean;
  signedIn: boolean;
}

/**
 * Current-workspace membership for the role-gated shell (UTA-74).
 *
 * Fetches `GET /api/auth/membership` once over the session cookie. Never
 * throws: unknown/signed-out states resolve to `{ membership: null }` so
 * chrome falls back to showing all entries until the role is known
 * (chrome fail-open for first-run/fixture flows; the server stays
 * deny-by-default and gates every deep link).
 */
export function useMembership(): MembershipState {
  // US29 row 43: on `/w/<id>/…` ask for that workspace's membership.
  const workspaceId = pathWorkspaceId(usePathname());
  const [membership, setMembership] = useState<MyMembershipView | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyMembership({ workspaceId: workspaceId ?? undefined })
      .then((m) => {
        if (cancelled) return;
        setMembership(m);
        setSignedIn(true);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setMembership(null);
        setSignedIn(false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return { membership, loading, signedIn };
}

/** Workspace id from `/w/<id>/…`; legacy unscoped routes → null. */
function pathWorkspaceId(pathname: string | null): string | null {
  const raw = /^\/w\/([^/?#]+)/.exec(pathname ?? '')?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

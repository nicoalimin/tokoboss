'use client';

import { useEffect, useState } from 'react';
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
 * navigation falls back to hiding Admin-only entries (deny-by-default) and
 * pages render their no-access states. The server remains the authority.
 */
export function useMembership(): MembershipState {
  const [membership, setMembership] = useState<MyMembershipView | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyMembership()
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
  }, []);

  return { membership, loading, signedIn };
}

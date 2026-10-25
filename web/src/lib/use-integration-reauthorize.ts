'use client';

import { useState } from 'react';
import type { IntegrationStoreConnection } from './integration-store-dialog';
import { reauthorizeIntegrationConnection } from './integrations-actions-client';

/**
 * Otorisasi ulang for the store detail page (US20 / RFC 04 task 122c-ii,
 * CoS split of 122c): `oauth_redirect` sends the browser to `authorizeUrl`;
 * an error or the `credential_binding` mode sets `reauthorizeFailed`.
 * `reauthorize` is absent with no connection or for Blibli (key form
 * parked with row 112). Used by `useIntegrationStoreActions` (122c-iii).
 */
export interface IntegrationReauthorize {
  reauthorizing: boolean;
  reauthorizeFailed: boolean;
  reauthorize?: () => void;
}

export function useIntegrationReauthorize(
  workspaceId: string,
  connection: IntegrationStoreConnection | null,
  navigate: (url: string) => void = (url) => window.location.assign(url)
): IntegrationReauthorize {
  const [reauthorizing, setReauthorizing] = useState(false);
  const [reauthorizeFailed, setReauthorizeFailed] = useState(false);
  const id = connection?.id ?? null;

  const start = () => {
    if (!id || reauthorizing) return;
    setReauthorizing(true);
    setReauthorizeFailed(false);
    reauthorizeIntegrationConnection(workspaceId, id)
      .then((res) => {
        if (res.mode !== 'oauth_redirect') throw new Error('no redirect');
        navigate(res.authorizeUrl);
      })
      .catch(() => {
        setReauthorizing(false);
        setReauthorizeFailed(true);
      });
  };

  const reauthorize =
    id && connection?.provider !== 'blibli' ? start : undefined;
  return { reauthorizing, reauthorizeFailed, reauthorize };
}

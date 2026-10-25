'use client';

import type { IntegrationCallbackResult } from '@tokoboss/contracts';
import {
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { useIntegrationConnection } from '@/lib/use-integration-connection';
import { useIntegrationStoreActions } from '@/lib/use-integration-store-actions';
import { useMembership } from '@/lib/use-membership';
import { DisconnectDialog } from './DisconnectDialog';
import { IntegrationStoreBody } from './IntegrationStoreBody';
import { IntegrationStoreFallback } from './IntegrationStoreFallback';
import { RemoveConnectionDialog } from './RemoveConnectionDialog';

/**
 * Store detail loader (US20 / RFC 04 task 122e-ii, CoS split of 122e), the
 * client island of page 122f: loads one store (122a, every member) and the
 * caller's role, wires the Admin actions (122c) into IntegrationStoreBody
 * (122d) and the Putuskan / Hapus koneksi confirm dialogs (118b / 119b).
 * Not found, error and loading: IntegrationStoreFallback (122e-i). Admin
 * actions fail closed (known Admin only; the server stays the boundary).
 */

export interface IntegrationStoreLoaderProps {
  workspaceId: string;
  connectionId: string;
  /** Parsed `?result=` from the OAuth callback redirect (122f). */
  result?: IntegrationCallbackResult | null;
  lang?: IntegrationLang;
}

export function IntegrationStoreLoader({
  workspaceId,
  connectionId,
  result,
  lang = 'id',
}: Readonly<IntegrationStoreLoaderProps>) {
  const data = useIntegrationConnection(workspaceId, connectionId);
  const { membership, loading: roleLoading } = useMembership();
  const actions = useIntegrationStoreActions(
    workspaceId,
    data.connection,
    data.replace
  );
  const { connection } = data;
  if (!connection || data.notFound || data.error || roleLoading) {
    return (
      <IntegrationStoreFallback
        workspaceId={workspaceId}
        notFound={data.notFound}
        error={data.error}
        onRetry={data.retry}
        lang={lang}
      />
    );
  }
  const isAdmin = membership?.role === 'admin';
  const dialog = {
    store: `${connection.storeName ?? connection.providerStoreId} \u00b7 ${INTEGRATION_PROVIDER_NAMES[connection.provider]}`,
    busy: actions.busy,
    failed: actions.failed,
    onConfirm: actions.confirm,
    onCancel: actions.cancel,
    lang,
  };
  return (
    <>
      <IntegrationStoreBody
        workspaceId={workspaceId}
        connection={connection}
        result={result}
        isAdmin={isAdmin}
        actions={actions}
        lang={lang}
      />
      <DisconnectDialog
        open={isAdmin && actions.dialog === 'disconnect'}
        {...dialog}
      />
      <RemoveConnectionDialog
        open={isAdmin && actions.dialog === 'remove'}
        {...dialog}
      />
    </>
  );
}

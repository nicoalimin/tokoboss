'use client';

import { useState } from 'react';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  CLOSED_STORE_DIALOG as CLOSED,
  STORE_DIALOG_CALLS as CALLS,
  type IntegrationStoreActions,
  type IntegrationStoreConnection,
  type IntegrationStoreDialog,
  type IntegrationStoreDialogState,
} from './integration-store-dialog';
import { useIntegrationReauthorize } from './use-integration-reauthorize';

export type {
  IntegrationStoreActions,
  IntegrationStoreDialog,
  IntegrationStoreDialogState,
} from './integration-store-dialog';

/**
 * Store detail Admin action hook (US20 / RFC 04 task 122c-iii, CoS split of
 * 122c): Putuskan and Hapus koneksi open their confirm dialog; a success
 * closes it and hands the returned connection to `replace` (122a hook).
 * Otorisasi ulang: `useIntegrationReauthorize` (122c-ii). Types and dialog
 * constants: `integration-store-dialog.ts` (122c-i). The server stays the
 * role boundary. Feeds the row 122 store detail loader; no copy, no markup.
 */
export function useIntegrationStoreActions(
  workspaceId: string,
  connection: IntegrationStoreConnection | null,
  replace: (connection: IntegrationConnectionView) => void,
  navigate?: (url: string) => void
): IntegrationStoreActions {
  const [state, setState] = useState<IntegrationStoreDialogState>(CLOSED);
  const reauth = useIntegrationReauthorize(workspaceId, connection, navigate);
  const id = connection?.id ?? null;

  const openDialog = (dialog: IntegrationStoreDialog) => {
    if (id && !state.busy) setState({ ...CLOSED, dialog });
  };

  const cancel = () => {
    if (!state.busy) setState(CLOSED);
  };

  const confirm = () => {
    const { dialog } = state;
    if (!id || !dialog || state.busy) return;
    setState({ dialog, busy: true, failed: false });
    CALLS[dialog](workspaceId, id)
      .then((updated) => {
        setState(CLOSED);
        replace(updated);
      })
      .catch(() => setState({ dialog, busy: false, failed: true }));
  };

  return { ...state, ...reauth, openDialog, confirm, cancel };
}

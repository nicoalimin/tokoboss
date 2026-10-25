import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  disconnectIntegrationConnection,
  removeIntegrationConnection,
} from './integrations-actions-client';

/**
 * Store detail Admin action types and dialog constants (US20 / RFC 04 task
 * 122c-i, CoS split of 122c): Putuskan and Hapus koneksi open their confirm
 * dialog (118b / 119b), which shows `busy` / `failed`; Otorisasi ulang is
 * absent for Blibli (key form parked with row 112). Hooks: 122c-ii
 * `use-integration-reauthorize.ts` and 122c-iii
 * `use-integration-store-actions.ts` (re-exports these types). No React.
 */

export type IntegrationStoreDialog = 'disconnect' | 'remove';

export interface IntegrationStoreDialogState {
  dialog: IntegrationStoreDialog | null;
  busy: boolean;
  failed: boolean;
}

export interface IntegrationStoreActions extends IntegrationStoreDialogState {
  reauthorizing: boolean;
  reauthorizeFailed: boolean;
  /** Absent with no connection or for Blibli (key form parked, row 112). */
  reauthorize?: () => void;
  openDialog: (dialog: IntegrationStoreDialog) => void;
  confirm: () => void;
  cancel: () => void;
}

/** The slice of a connection view the action hook needs. */
export type IntegrationStoreConnection = Pick<
  IntegrationConnectionView,
  'id' | 'provider'
>;

export const CLOSED_STORE_DIALOG: IntegrationStoreDialogState = {
  dialog: null,
  busy: false,
  failed: false,
};

/** The 101c client write behind each confirm dialog. */
export const STORE_DIALOG_CALLS = {
  disconnect: disconnectIntegrationConnection,
  remove: removeIntegrationConnection,
};

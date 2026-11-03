'use client';

import { useCallback, useState } from 'react';
import type { StoreHealthRowView } from './integration-management-views';
import { disconnectIntegrationConnection } from './integrations-actions-client';
import {
  centerStoreHref,
  centerStoreLabel,
  startCenterReauthorize,
  toggleCenterCapability,
  type CenterCapabilityKey,
} from './integration-center-actions';

/** US18 / RFC 07 row 45b: Admin Center actions + DisconnectDialog state. */
export interface CenterRowActions {
  onToggle?: (id: string, key: CenterCapabilityKey, enabled: boolean) => void;
  onManage?: (id: string) => void;
  onReauthorize?: (id: string) => void;
  onDisconnect?: (id: string) => void;
}
/** DisconnectDialogProps shape (lang supplied by the loader). */
export interface CenterDisconnectState {
  open: boolean;
  store: string;
  busy: boolean;
  failed: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
export interface IntegrationCenterActionsResult {
  actions?: CenterRowActions;
  onManageConnection?: (id: string) => void;
  toast?: string;
  disconnect: CenterDisconnectState;
}

type DiscState = { targetId: string | null; busy: boolean; failed: boolean };
const CLOSED: DiscState = { targetId: null, busy: false, failed: false };

export function useIntegrationCenterActions(
  workspaceId: string,
  rows: readonly StoreHealthRowView[],
  isAdmin: boolean,
  reload: () => void,
  navigate: (url: string) => void = (url) => window.location.assign(url)
): IntegrationCenterActionsResult {
  const [toast, setToast] = useState<string>();
  const [disc, setDisc] = useState<DiscState>(CLOSED);
  const find = useCallback(
    (id: string) => rows.find((r) => r.connection.id === id),
    [rows]
  );
  const onCancel = useCallback(() => {
    if (!disc.busy) setDisc(CLOSED);
  }, [disc.busy]);
  const onConfirm = useCallback(() => {
    const id = disc.targetId;
    if (!id || disc.busy) return;
    setDisc({ targetId: id, busy: true, failed: false });
    disconnectIntegrationConnection(workspaceId, id)
      .then(() => {
        setDisc(CLOSED);
        reload();
      })
      .catch(() => setDisc({ targetId: id, busy: false, failed: true }));
  }, [disc.targetId, disc.busy, workspaceId, reload]);
  const target = disc.targetId ? find(disc.targetId) : undefined;
  const disconnect: CenterDisconnectState = {
    open: Boolean(isAdmin && disc.targetId),
    store: target ? centerStoreLabel(target) : '',
    busy: disc.busy,
    failed: disc.failed,
    onConfirm,
    onCancel,
  };
  if (!isAdmin) return { disconnect: { ...disconnect, open: false } };
  return {
    actions: {
      onToggle: (id, key, enabled) => {
        void toggleCenterCapability(workspaceId, id, key, enabled).then((n) => {
          setToast(n);
          reload();
        });
      },
      onReauthorize: (id) => {
        const row = find(id);
        if (!row) return;
        void startCenterReauthorize(workspaceId, row, navigate).catch(() =>
          setToast('Terjadi kesalahan. Coba lagi.')
        );
      },
      onDisconnect: (id) => {
        if (!disc.busy) setDisc({ targetId: id, busy: false, failed: false });
      },
    },
    onManageConnection: (id) => navigate(centerStoreHref(workspaceId, id)),
    toast,
    disconnect,
  };
}

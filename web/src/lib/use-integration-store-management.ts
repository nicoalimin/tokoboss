'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  IntegrationActivityItemDto,
  UpdateConnectionControlsBody,
} from '@tokoboss/contracts';
import type { StoreHealthRowView } from './integration-management-views';
import {
  fetchConnectionActivity,
  updateConnectionControlsRequest,
} from './integrations-actions-client';
import {
  IntegrationClientError,
  INTEGRATIONS_GENERIC_ERROR,
  integrationsPath,
  integrationsRequest,
  type FetchFn,
} from './integrations-client';

/**
 * Store detail Story 18 wiring (UTA-38 / US18, RFC 07 row 42a): row 27
 * detail GET (health row; dates stay ISO strings, the cards read ids and
 * flags) + row 26 activity feed, and the row 25 controls PATCH, which then
 * reloads both. A failed read hides the cards; a failed save shows why.
 */

export interface IntegrationStoreManagement {
  health?: StoreHealthRowView;
  activity?: IntegrationActivityItemDto[];
  onControlsChange?: (body: UpdateConnectionControlsBody) => void;
  controlsNotice?: string;
}

type Loaded = Pick<IntegrationStoreManagement, 'health' | 'activity'>;
export const CONTROLS_SAVED_NOTICE = '✅ Kontrol kemampuan disimpan.';
export const CONTROLS_RECONCILE_NOTICE =
  '✅ Disimpan. Rekonsiliasi stok on-request sedang berjalan.';

/** Detail GET (health row) and the activity feed, fetched in parallel. */
export async function loadIntegrationStoreManagement(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<Required<Loaded>> {
  const path = integrationsPath(workspaceId, connectionId);
  const [health, activity] = await Promise.all([
    integrationsRequest<StoreHealthRowView>(path, {}, fetchFn),
    fetchConnectionActivity(workspaceId, connectionId, fetchFn),
  ]);
  return { health, activity };
}

/** Controls PATCH (Admin only); resolves to the card notice to show. */
export async function saveIntegrationStoreControls(
  workspaceId: string,
  connectionId: string,
  body: UpdateConnectionControlsBody,
  fetchFn: FetchFn = fetch
): Promise<string> {
  try {
    const res = await updateConnectionControlsRequest(
      workspaceId,
      connectionId,
      body,
      fetchFn
    );
    return res.reconciliationQueued
      ? CONTROLS_RECONCILE_NOTICE
      : CONTROLS_SAVED_NOTICE;
  } catch (err) {
    if (err instanceof IntegrationClientError) return err.message;
    return INTEGRATIONS_GENERIC_ERROR;
  }
}

export function useIntegrationStoreManagement(
  workspaceId: string,
  connectionId: string
): IntegrationStoreManagement {
  const [data, setData] = useState<Loaded>({});
  const [notice, setNotice] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    loadIntegrationStoreManagement(workspaceId, connectionId)
      .then((next) => gen === generation.current && setData(next))
      .catch(() => gen === generation.current && setData({}));
  }, [workspaceId, connectionId, attempt]);

  const onControlsChange = (body: UpdateConnectionControlsBody) => {
    void saveIntegrationStoreControls(workspaceId, connectionId, body).then(
      (text) => {
        setNotice(text);
        setAttempt((n) => n + 1);
      }
    );
  };

  return { ...data, onControlsChange, controlsNotice: notice };
}

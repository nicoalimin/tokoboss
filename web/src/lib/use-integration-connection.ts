'use client';

import { useEffect, useRef, useState } from 'react';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  getIntegrationConnection,
  IntegrationClientError,
  INTEGRATIONS_GENERIC_ERROR,
} from './integrations-client';

/**
 * Store detail data (US20 / RFC 04 task 122a, CoS split of row 122): one
 * connection from the 101a detail GET (every member). A failed read keeps
 * the route's client-safe message in `error`; a 404 (unknown or removed)
 * also sets `notFound`. `replace` swaps in the connection a write returned
 * (Putuskan, Hapus koneksi, Blibli keys); `retry` reloads; stale responses
 * are dropped. Feeds the row 122 store detail loader; no copy, no markup.
 */

export interface IntegrationConnectionData {
  connection: IntegrationConnectionView | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
}

export interface IntegrationConnectionState extends IntegrationConnectionData {
  replace: (connection: IntegrationConnectionView) => void;
  retry: () => void;
}

const START: IntegrationConnectionData = {
  connection: null,
  loading: true,
  error: null,
  notFound: false,
};

export function useIntegrationConnection(
  workspaceId: string,
  connectionId: string
): IntegrationConnectionState {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<IntegrationConnectionData>(START);
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    getIntegrationConnection(workspaceId, connectionId)
      .then((connection) => {
        if (gen !== generation.current) return;
        setData({ ...START, connection, loading: false });
      })
      .catch((err: unknown) => {
        if (gen !== generation.current) return;
        const known = err instanceof IntegrationClientError;
        setData({
          ...START,
          loading: false,
          error: known ? err.message : INTEGRATIONS_GENERIC_ERROR,
          notFound: known && err.status === 404,
        });
      });
  }, [workspaceId, connectionId, attempt]);

  const retry = () => {
    setData(START);
    setAttempt((n) => n + 1);
  };

  const replace = (connection: IntegrationConnectionView) => {
    if (connection.id !== connectionId) return;
    generation.current++;
    setData({ ...START, connection, loading: false });
  };

  return { ...data, replace, retry };
}

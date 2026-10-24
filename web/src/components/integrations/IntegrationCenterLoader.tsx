'use client';

import { useEffect, useState } from 'react';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  getIntegrationConnections,
  IntegrationClientError,
  INTEGRATIONS_GENERIC_ERROR,
} from '@/lib/integrations-client';
import type { IntegrationLang } from '@/lib/integration-copy';
import { useMembership } from '@/lib/use-membership';
import { IntegrationCenterPanel } from './IntegrationCenterPanel';

/**
 * Integration Center loader (US20 / RFC 04 task 109a), the client island of
 * page 109b: loads the stores (101, every member) and the caller's role, then
 * renders the panel (108) with the wizard / store detail hrefs. Admin actions
 * fail closed (known Admin only; the server stays the boundary).
 */

export interface IntegrationCenterLoaderProps {
  workspaceId: string;
  lang?: IntegrationLang;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; connections: IntegrationConnectionView[] };

const TEXT: Record<IntegrationLang, { loading: string; retry: string }> = {
  id: { loading: 'Memuat toko…', retry: 'Coba lagi' },
  en: { loading: 'Loading stores…', retry: 'Try again' },
};

export function IntegrationCenterLoader({
  workspaceId,
  lang = 'id',
}: Readonly<IntegrationCenterLoaderProps>) {
  const { membership, loading: roleLoading } = useMembership();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getIntegrationConnections(workspaceId)
      .then((connections) => {
        if (!cancelled) setState({ kind: 'ready', connections });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof IntegrationClientError
            ? err.message
            : INTEGRATIONS_GENERIC_ERROR;
        setState({ kind: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, attempt]);

  const text = TEXT[lang] ?? TEXT.id;
  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        data-testid="integration-center-error"
        className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-800"
      >
        <p>{state.message}</p>
        <button
          type="button"
          onClick={() => {
            setState({ kind: 'loading' });
            setAttempt((n) => n + 1);
          }}
          className="mt-3 min-h-[44px] rounded-lg border border-error-300 bg-white px-4 py-2 font-semibold hover:bg-error-100"
        >
          {text.retry}
        </button>
      </div>
    );
  }
  if (state.kind === 'loading' || roleLoading) {
    return (
      <p role="status" className="text-sm text-neutral-600">
        {text.loading}
      </p>
    );
  }
  const base = `/w/${encodeURIComponent(workspaceId)}/integrasi`;
  return (
    <IntegrationCenterPanel
      connections={state.connections}
      isAdmin={membership?.role === 'admin'}
      connectHref={`${base}/hubungkan`}
      storeHrefBase={base}
      lang={lang}
    />
  );
}

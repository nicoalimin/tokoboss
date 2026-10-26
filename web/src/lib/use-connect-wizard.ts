'use client';

import { useState } from 'react';
import type {
  IntegrationBlibliKeyFormBody,
  MarketplaceProviderWire,
} from '@tokoboss/contracts';
import {
  connectBlibliStore,
  startIntegrationConnection,
} from './integrations-actions-client';
import {
  IntegrationClientError,
  INTEGRATIONS_GENERIC_ERROR,
} from './integrations-client';

/**
 * Connect wizard state (US20 / RFC 04 task 113d1, CoS split of row 113),
 * mockup v2 screen 2 steps 1–4. Step 2 `start`s the provider: OAuth shows
 * step 3 and goes to `authorizeUrl`; Blibli shows step 3 as the key form,
 * and `submitKeys` (113b) opens the store page with `?result=connected`,
 * like the OAuth callback. `cancel` returns to Integrasi, no connection.
 * `error` is the route's client-safe message. Rendered by 113e.
 */
export interface ConnectWizardState {
  step: 1 | 2 | 3 | 4;
  provider: MarketplaceProviderWire | null;
  /** True when step 3 is the Blibli key form (credential binding). */
  keyForm: boolean;
  busy: boolean;
  error: string | null;
  select: (provider: MarketplaceProviderWire) => void;
  next: () => void;
  back: () => void;
  start: () => void;
  submitKeys: (keys: IntegrationBlibliKeyFormBody) => void;
  cancel: () => void;
}

export function useConnectWizard(
  workspaceId: string,
  navigate: (url: string) => void = (url) => window.location.assign(url)
): ConnectWizardState {
  const [step, setStep] = useState<ConnectWizardState['step']>(1);
  const [provider, setProvider] = useState<MarketplaceProviderWire | null>(
    null
  );
  const [keyForm, setKeyForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const home = `/w/${workspaceId}/integrasi`;

  const begin = () => {
    setBusy(true);
    setError(null);
  };
  const fail = (err: unknown) => {
    setBusy(false);
    const known = err instanceof IntegrationClientError;
    setError(known ? err.message : INTEGRATIONS_GENERIC_ERROR);
  };

  const select = (pick: MarketplaceProviderWire) => {
    if (step === 1) setProvider(pick);
  };
  const next = () => {
    if (step === 1 && provider) setStep(2);
  };
  const back = () => {
    if (busy || step === 1 || step === 4) return;
    setError(null);
    setKeyForm(false);
    setStep(step === 3 ? 2 : 1);
  };

  const start = () => {
    if (step !== 2 || !provider || busy) return;
    begin();
    startIntegrationConnection(workspaceId, provider)
      .then((res) => {
        setStep(3);
        if (res.mode === 'oauth_redirect') return navigate(res.authorizeUrl);
        setBusy(false);
        setKeyForm(true);
      })
      .catch(fail);
  };

  const submitKeys = (keys: IntegrationBlibliKeyFormBody) => {
    if (!keyForm || busy) return;
    begin();
    connectBlibliStore(workspaceId, keys)
      .then((connection) => {
        setStep(4);
        navigate(`${home}/${connection.id}?result=connected`);
      })
      .catch(fail);
  };

  const cancel = () => {
    if (!busy) navigate(home);
  };

  const view = { step, provider, keyForm, busy, error };
  return { ...view, select, next, back, start, submitKeys, cancel };
}

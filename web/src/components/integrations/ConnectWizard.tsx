'use client';

import { ConnectProviderStep } from './ConnectProviderStep';
import { ConnectWizardSteps } from './ConnectWizardSteps';
import { ConsentStep } from './ConsentStep';
import { BlibliKeyForm } from './BlibliKeyForm';
import { getIntegrationConnectCopy } from '@/lib/integration-connect-copy';
import {
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { useConnectWizard } from '@/lib/use-connect-wizard';

/**
 * Connect wizard (US20 / RFC 04 task 113e, CoS split of row 113), mockup v2
 * screen 2: step header (113d2) + the body for useConnectWizard's step
 * (113d1): 1 picker, 2 consent, 3 Blibli key form or OAuth redirecting
 * note, 4 returning note. Blibli success opens the store page with
 * ?result=connected; Batal returns to Integrasi. `clientId` (Blibli client
 * id) is read server-side by the page (114).
 */
export interface ConnectWizardProps {
  workspaceId: string;
  clientId: string | null;
  lang?: IntegrationLang;
  /** Test seam; defaults to window.location.assign in the hook. */
  navigate?: (url: string) => void;
}

const NOTE = 'rounded-xl bg-neutral-100 px-3 py-2 text-sm text-neutral-700';
const ERR = 'text-sm text-error-700';
const BTN =
  'min-h-[44px] rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';

export function ConnectWizard({
  workspaceId,
  clientId,
  lang = 'id',
  navigate,
}: Readonly<ConnectWizardProps>) {
  const w = useConnectWizard(workspaceId, navigate);
  const copy = getIntegrationConnectCopy(lang);
  const name = w.provider ? INTEGRATION_PROVIDER_NAMES[w.provider] : '';
  let note: string | null = null;
  if (w.step === 4) note = copy.returning;
  else if (w.step === 3 && !w.keyForm) note = copy.redirecting(name);
  return (
    <div data-testid="connect-wizard" className="flex flex-col gap-4">
      <ConnectWizardSteps step={w.step} lang={lang} />
      {w.step === 1 ? (
        <ConnectProviderStep
          selected={w.provider}
          onSelect={w.select}
          onNext={w.next}
          onCancel={w.cancel}
          lang={lang}
        />
      ) : null}
      {w.step === 2 && w.provider ? (
        <ConsentStep
          provider={w.provider}
          onNext={w.start}
          onBack={w.back}
          busy={w.busy}
          lang={lang}
        />
      ) : null}
      {w.step === 2 && w.error ? (
        <p role="alert" data-testid="connect-wizard-error" className={ERR}>
          {w.error}
        </p>
      ) : null}
      {w.step === 3 && w.keyForm ? (
        <>
          <BlibliKeyForm
            clientId={clientId}
            onSubmit={w.submitKeys}
            busy={w.busy}
            error={w.error}
            lang={lang}
          />
          <div className="flex flex-wrap gap-2">
            {(['back', 'cancel'] as const).map((key) => (
              <button
                key={key}
                type="button"
                data-testid={`connect-wizard-${key}`}
                onClick={w[key]}
                disabled={w.busy}
                className={BTN}
              >
                {copy[key]}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {note ? (
        <p role="status" data-testid="connect-wizard-note" className={NOTE}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

import type { MarketplaceProviderWire } from '@tokoboss/contracts';
import { getIntegrationConnectCopy } from '@/lib/integration-connect-copy';
import { getIntegrationConsentCopy } from '@/lib/integration-consent-copy';
import {
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';

/**
 * Connect wizard step 2, consent (US20 / RFC 04 task 111), mockup v2 screen
 * 2: intro naming the provider, "Data yang dibaca" / "Data yang diperbarui"
 * scope lists (stock is updated only after mapping and sync are enabled, so
 * sync stays off), the own-stores note, then Lanjut ke {provider} / Kembali.
 * Controlled: ConnectWizard (113) owns the provider, busy flag and steps.
 * No fetch, no state.
 */

export interface ConsentStepProps {
  provider: MarketplaceProviderWire;
  onNext: () => void;
  onBack: () => void;
  /** True while 113 starts the connection; disables Lanjut. */
  busy?: boolean;
  lang?: IntegrationLang;
}

const LIST = 'mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-800';

export function ConsentStep({
  provider,
  onNext,
  onBack,
  busy = false,
  lang = 'id',
}: Readonly<ConsentStepProps>) {
  const copy = getIntegrationConsentCopy(lang);
  const nav = getIntegrationConnectCopy(lang);
  const name = INTEGRATION_PROVIDER_NAMES[provider];
  return (
    <div data-testid="consent-step" className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">{copy.consentIntro(name)}</p>
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="text-sm font-bold text-neutral-900">
          {copy.readHeading}
        </h3>
        <ul data-testid="consent-read-scopes" className={LIST}>
          {copy.readScopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
        <h3 className="mt-3 text-sm font-bold text-neutral-900">
          {copy.updateHeading}
        </h3>
        <ul data-testid="consent-update-scopes" className={LIST}>
          {copy.updateScopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
      </div>
      <p
        data-testid="consent-own-stores-note"
        className="rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-700"
      >
        {copy.ownStoresNote}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="consent-next"
          onClick={onNext}
          disabled={busy}
          aria-busy={busy}
          className="min-h-[44px] rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {copy.continueTo(name)}
        </button>
        <button
          type="button"
          data-testid="consent-back"
          onClick={onBack}
          className="min-h-[44px] rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          {nav.back}
        </button>
      </div>
    </div>
  );
}

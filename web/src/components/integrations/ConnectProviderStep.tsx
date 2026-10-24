import type { MarketplaceProviderWire } from '@tokoboss/contracts';
import { getIntegrationConnectCopy } from '@/lib/integration-connect-copy';
import { getIntegrationConsentCopy } from '@/lib/integration-consent-copy';
import {
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { INTEGRATION_PROVIDER_ORDER } from '@/lib/integration-views';

/**
 * Connect wizard step 1, provider picker (US20 / RFC 04 task 110b, CoS
 * split of row 110), mockup v2 screen 2: "Pilih marketplace", one button per
 * provider (name + sign-in hint) in screen-1 order, then Lanjut / Batal.
 * Controlled: ConnectWizard (113) owns the selection and the step change.
 * Lanjut stays disabled until a provider is picked. No fetch, no state.
 */

export interface ConnectProviderStepProps {
  selected: MarketplaceProviderWire | null;
  onSelect: (provider: MarketplaceProviderWire) => void;
  onNext: () => void;
  onCancel: () => void;
  lang?: IntegrationLang;
}

const OPTION = 'min-h-[44px] rounded-xl border-2 p-3 text-left';
const SELECTED = 'border-primary-500 bg-primary-50';
const IDLE = 'border-neutral-200 bg-white hover:bg-neutral-50';

export function ConnectProviderStep({
  selected,
  onSelect,
  onNext,
  onCancel,
  lang = 'id',
}: Readonly<ConnectProviderStepProps>) {
  const copy = getIntegrationConnectCopy(lang);
  const signIn = getIntegrationConsentCopy(lang).providerSignIn;
  return (
    <div data-testid="connect-provider-step" className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-neutral-900">
          {copy.pickLabel}
        </legend>
        <div className="grid gap-3 md:grid-cols-3">
          {INTEGRATION_PROVIDER_ORDER.map((provider) => {
            const on = provider === selected;
            return (
              <button
                key={provider}
                type="button"
                data-testid="connect-provider-option"
                data-provider={provider}
                aria-pressed={on}
                onClick={() => onSelect(provider)}
                className={`${OPTION} ${on ? SELECTED : IDLE}`}
              >
                <span className="block text-sm font-bold text-neutral-900">
                  {INTEGRATION_PROVIDER_NAMES[provider]}
                </span>
                <span className="block text-xs text-neutral-600">
                  {signIn[provider]}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="connect-provider-next"
          onClick={onNext}
          disabled={selected === null}
          className="min-h-[44px] rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {copy.next}
        </button>
        <button
          type="button"
          data-testid="connect-provider-cancel"
          onClick={onCancel}
          className="min-h-[44px] rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          {copy.cancel}
        </button>
      </div>
    </div>
  );
}

import { getIntegrationBlibliCopy } from '@/lib/integration-blibli-copy';
import type { IntegrationLang } from '@/lib/integration-copy';

/**
 * Blibli key form header (US20 / RFC 04 task 112b, CoS split of row 112;
 * Design § Credential binding, O6): title, intro, TokoBoss's API client id
 * (or clientIdMissing when this deploy has none) and the numbered Seller
 * Center binding steps. Rendered at the top of BlibliKeyForm (112c), which
 * owns the fields and submit. Presentational: no fetch, no state.
 */
export interface BlibliBindingInfoProps {
  /** TokoBoss's Blibli API client id; null shows clientIdMissing. */
  clientId: string | null;
  lang?: IntegrationLang;
}

export function BlibliBindingInfo({
  clientId,
  lang = 'id',
}: Readonly<BlibliBindingInfoProps>) {
  const copy = getIntegrationBlibliCopy(lang);
  return (
    <div data-testid="blibli-binding-info" className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-neutral-900">{copy.title}</h3>
      <p className="text-sm text-neutral-600">{copy.intro}</p>
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <p className="text-xs text-neutral-600">{copy.clientIdLabel}</p>
        {clientId ? (
          <code
            data-testid="blibli-client-id"
            className="mt-1 block break-all text-sm font-semibold text-neutral-900"
          >
            {clientId}
          </code>
        ) : (
          <p
            data-testid="blibli-client-id-missing"
            className="mt-1 text-sm text-warning-700"
          >
            {copy.clientIdMissing}
          </p>
        )}
        <h4 className="mt-3 text-sm font-bold text-neutral-900">
          {copy.stepsHeading}
        </h4>
        <ol
          data-testid="blibli-steps"
          className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-800"
        >
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

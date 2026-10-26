import { getIntegrationConnectCopy } from '@/lib/integration-connect-copy';
import type { IntegrationLang } from '@/lib/integration-copy';

/**
 * Connect wizard step header (US20 / RFC 04 task 113d2, CoS split of row
 * 113), mockup v2 screen 2 `.steps`: four pills "1 · Pilih penyedia" …
 * "4 · Kembali ke TokoBoss" from getIntegrationConnectCopy().steps (110a).
 * The active step is highlighted and has aria-current="step"; the others
 * stay muted. Presentational and server-safe: no hooks, no fetch, no state;
 * ConnectWizard (113e) passes `step` from useConnectWizard (113d1).
 */

export interface ConnectWizardStepsProps {
  step: 1 | 2 | 3 | 4;
  lang?: IntegrationLang;
}

const PILL = 'rounded-full px-3 py-1 text-xs';
const ON = 'bg-primary-50 font-semibold text-primary-700';
const OFF = 'bg-neutral-100 text-neutral-600';

export function ConnectWizardSteps({
  step,
  lang = 'id',
}: Readonly<ConnectWizardStepsProps>) {
  const copy = getIntegrationConnectCopy(lang);
  return (
    <ol
      aria-label={copy.title}
      data-testid="connect-wizard-steps"
      className="flex flex-wrap gap-2"
    >
      {copy.steps.map((label, i) => {
        const on = i + 1 === step;
        return (
          <li
            key={label}
            data-testid="connect-wizard-step"
            data-step={i + 1}
            aria-current={on ? 'step' : undefined}
            className={`${PILL} ${on ? ON : OFF}`}
          >
            {`${i + 1} · ${label}`}
          </li>
        );
      })}
    </ol>
  );
}

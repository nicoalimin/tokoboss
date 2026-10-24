import {
  getIntegrationCopy,
  type IntegrationLang,
} from '@/lib/integration-copy';
import type { IntegrationProblemVariant } from '@/lib/integration-problem-views';
import { getIntegrationProblemScreenCopy } from '@/lib/integration-problem-screen-copy';
import { AskAdminButton } from './AskAdminButton';

/**
 * Problem-card recovery action (US20 / RFC 04 task 116b, CoS split of row
 * 116): mockup v2 screen 4. Admins get Coba lagi (cancelled) or Otorisasi
 * ulang (token expired, permission missing); Manager / Staff get Minta
 * Admin instead. Blocked, different store and maintenance / rate limit have
 * no action (per the mockup; ConnectBlockedDetails holds blocked's way
 * back). ConnectProblem (116c) renders this; the parent owns `onAction`
 * (start / reauthorize), so it sits inside a client component.
 */

export type ConnectProblemActionKind = 'retry' | 'reauthorize';

const ACTION: Record<
  IntegrationProblemVariant,
  ConnectProblemActionKind | null
> = {
  cancelled: 'retry',
  token_expired: 'reauthorize',
  permission_missing: 'reauthorize',
  blocked: null,
  mismatch: null,
  unavailable: null,
};

export function connectProblemAction(
  variant: IntegrationProblemVariant
): ConnectProblemActionKind | null {
  return ACTION[variant] ?? null;
}

export interface ConnectProblemActionProps {
  variant: IntegrationProblemVariant;
  /** Provider display name, e.g. Shopee. */
  provider: string;
  isAdmin: boolean;
  /** Admin start / reauthorize; the button is hidden when absent. */
  onAction?: () => void;
  busy?: boolean;
  lang?: IntegrationLang;
}

export function ConnectProblemAction({
  variant,
  provider,
  isAdmin,
  onAction,
  busy = false,
  lang = 'id',
}: Readonly<ConnectProblemActionProps>) {
  const kind = connectProblemAction(variant);
  if (!kind) return null;
  if (!isAdmin) return <AskAdminButton provider={provider} lang={lang} />;
  if (!onAction) return null;
  const label =
    kind === 'retry'
      ? getIntegrationProblemScreenCopy(lang).retry
      : getIntegrationCopy(lang).reauthorize;
  return (
    <div>
      <button
        type="button"
        data-testid="connect-problem-action"
        data-action={kind}
        onClick={onAction}
        disabled={busy}
        className="min-h-[44px] rounded-lg bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
      >
        {label}
      </button>
    </div>
  );
}

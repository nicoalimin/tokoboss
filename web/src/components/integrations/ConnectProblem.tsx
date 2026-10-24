import { getIntegrationProblemCopy } from '@/lib/integration-problem-copy';
import {
  getIntegrationProblemScreenCopy,
  type IntegrationBlockedAuditContext,
} from '@/lib/integration-problem-screen-copy';
import type {
  IntegrationProblem,
  IntegrationProblemVariant,
} from '@/lib/integration-problem-views';
import { ConnectBlockedDetails } from './ConnectBlockedDetails';
import {
  ConnectProblemAction,
  type ConnectProblemActionProps,
} from './ConnectProblemAction';
import { StatusBadge } from './StatusBadge';

/**
 * Problem card (US20 / RFC 04 task 116c, CoS split of row 116): mockup v2
 * screen 4 — title, chip, message in the variant's tone, ConnectProblemAction
 * (116b); `blocked` adds the PRD neutral headline and ConnectBlockedDetails
 * (116a) and never names the owning workspace. No fetch, no state.
 */

const NOTE_CLASS: Record<IntegrationProblemVariant, string> = {
  cancelled: 'bg-neutral-100 text-neutral-700',
  token_expired: 'bg-warning-50 text-warning-700',
  permission_missing: 'bg-error-50 text-error-700',
  blocked: 'bg-error-50 text-error-700',
  mismatch: 'bg-warning-50 text-warning-700',
  unavailable: 'bg-neutral-100 text-neutral-700',
};

type ActionProps = Omit<ConnectProblemActionProps, 'variant'>;
export interface ConnectProblemProps extends ActionProps {
  problem: IntegrationProblem;
  storeName?: string;
  storeId?: string;
  /** Blocked card: Integration Center path, support link, audit entry. */
  centerHref: string;
  supportHref?: string;
  audit?: IntegrationBlockedAuditContext;
}

export function ConnectProblem(props: Readonly<ConnectProblemProps>) {
  const { problem, provider, lang = 'id' } = props;
  const { variant } = problem;
  const copy = getIntegrationProblemCopy(lang);
  const entry = copy.problems[variant];
  const message = entry.message({
    provider,
    storeName: props.storeName ?? '',
    storeId: props.storeId ?? '',
    missingPermissions: problem.missingPermissions,
  });
  const blocked = variant === 'blocked';
  return (
    <section
      data-testid="connect-problem"
      data-variant={variant}
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-neutral-900">
          {entry.title}
        </h3>
        {variant === 'token_expired' ? (
          <StatusBadge status="needs_reauth" lang={lang} />
        ) : null}
        {blocked ? (
          <span className="rounded-full bg-error-50 px-2.5 py-1 text-xs font-semibold text-error-700">
            {getIntegrationProblemScreenCopy(lang).blockedChip}
          </span>
        ) : null}
      </div>
      <p className={`rounded-lg px-3 py-2 text-sm ${NOTE_CLASS[variant]}`}>
        {blocked ? <b>{copy.blockedHeadline}</b> : message}
      </p>
      {blocked ? (
        <>
          <p className="text-sm text-neutral-700">{message}</p>
          <ConnectBlockedDetails
            centerHref={props.centerHref}
            supportHref={props.supportHref}
            audit={props.audit}
            lang={lang}
          />
        </>
      ) : null}
      <ConnectProblemAction
        variant={variant}
        provider={provider}
        isAdmin={props.isAdmin}
        onAction={props.onAction}
        busy={props.busy}
        lang={lang}
      />
    </section>
  );
}

import Link from 'next/link';
import type { IntegrationLang } from '@/lib/integration-copy';
import {
  getIntegrationProblemScreenCopy,
  type IntegrationBlockedAuditContext,
} from '@/lib/integration-problem-screen-copy';

/**
 * Blocked-elsewhere details (US20 / RFC 04 task 116a): mockup v2 screen 4,
 * the lower part of the "Toko sudah terhubung ke workspace lain" card —
 * next steps, support, the history note, this workspace's audit line and
 * the way back. ConnectProblem (116b) renders the title, Diblokir chip,
 * PRD headline and message above it. Never names or hints at the owning
 * workspace. Presentational: no fetch, no state.
 */

export interface ConnectBlockedDetailsProps {
  /** Integration Center path, e.g. `/w/<workspaceId>/integrasi`. */
  centerHref: string;
  /** No support channel exists yet; plain text when absent. */
  supportHref?: string;
  /** This workspace's blocked-attempt audit entry, when known. */
  audit?: IntegrationBlockedAuditContext;
  lang?: IntegrationLang;
}

export function ConnectBlockedDetails({
  centerHref,
  supportHref,
  audit,
  lang = 'id',
}: Readonly<ConnectBlockedDetailsProps>) {
  const copy = getIntegrationProblemScreenCopy(lang);
  return (
    <div data-testid="connect-blocked-details" className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-neutral-900">
        {copy.nextStepsTitle}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
        {copy.nextSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
        <li>
          {copy.supportPrefix}{' '}
          {supportHref ? (
            <a
              href={supportHref}
              className="underline underline-offset-2 text-secondary-700 hover:text-secondary-800"
            >
              {copy.supportLink}
            </a>
          ) : (
            copy.supportLink
          )}
          .
        </li>
      </ul>
      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
        {copy.historyNote}
      </p>
      {audit ? (
        <p
          data-testid="connect-blocked-audit"
          className="text-xs text-neutral-600"
        >
          📝 {copy.auditLabel}: <i>{copy.blockedAudit(audit)}</i>
        </p>
      ) : null}
      <div>
        <Link
          href={centerHref}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          {copy.backToCenter}
        </Link>
      </div>
    </div>
  );
}

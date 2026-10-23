import type * as ports from './integration-ports';

/** CoS O9 (2026-10-19): raw inbound webhook events are kept for 30 days. */
export const INBOUND_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface PurgeInboundEventsDeps {
  events: Pick<ports.InboundEventStore, 'purgeBefore'>;
  now(): Date;
}

export interface PurgeInboundEventsResult {
  cutoff: Date;
  purged: number;
}

/**
 * Inbound event retention (US20 / RFC 04 task 95h). Deletes raw inbound
 * webhook events of any status created strictly before now - 30 days and
 * returns the cutoff and the number removed. Idempotent: an immediate re-run
 * purges 0.
 */
export async function purgeInboundEvents(
  deps: PurgeInboundEventsDeps
): Promise<PurgeInboundEventsResult> {
  const cutoff = new Date(deps.now().getTime() - INBOUND_EVENT_RETENTION_MS);
  const purged = await deps.events.purgeBefore(cutoff);
  return { cutoff, purged };
}

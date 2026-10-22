import type { NewJobInput } from '../jobs/job-types';
import type * as ports from './integration-ports';

/** Job type the webhook route enqueues per accepted inbound event. */
export const INBOUND_EVENT_JOB_TYPE = 'marketplace.inbound_event';

/**
 * Webhook ack follow-up (US20 / RFC 04 task 94a). After
 * `ingestWebhookEvent` the route hands over `acceptedEventIds`; each is
 * looked up to get its owning workspace and gets one durable
 * `marketplace.inbound_event` job (idempotent key per event id, actor
 * `system`) that later runs `processInboundEvent`. A missing event or one
 * with no workspace (ignored) is skipped. A duplicate job is not counted.
 */

export interface EnqueueInboundEventJobsDeps {
  events: Pick<ports.InboundEventStore, 'find'>;
  enqueueJob(
    input: NewJobInput
  ): Promise<{ job: { id: string }; duplicate: boolean }>;
}

export interface EnqueueInboundEventJobsResult {
  jobIds: string[];
  skipped: number;
}

export async function enqueueInboundEventJobs(
  deps: EnqueueInboundEventJobsDeps,
  eventIds: readonly string[],
  correlationId?: string
): Promise<EnqueueInboundEventJobsResult> {
  const jobIds: string[] = [];
  let skipped = 0;
  for (const eventId of eventIds) {
    const event = await deps.events.find(eventId);
    if (!event || !event.workspaceId) {
      skipped += 1;
      continue;
    }
    const { job, duplicate } = await deps.enqueueJob({
      workspaceId: event.workspaceId,
      type: INBOUND_EVENT_JOB_TYPE,
      idempotencyKey: `${INBOUND_EVENT_JOB_TYPE}:${eventId}`,
      correlationId,
      actorType: 'system',
      inputRef: { eventId },
    });
    if (!duplicate) jobIds.push(job.id);
  }
  return { jobIds, skipped };
}

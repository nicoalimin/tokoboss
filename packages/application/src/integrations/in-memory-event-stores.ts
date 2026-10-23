import type { MarketplaceOrderPreviewRow } from '@tokoboss/domain';
import type {
  InboundEventRecord,
  InboundEventStatus,
} from './integration-port-inputs';
import type { InboundEventStore, OrderPreviewStore } from './integration-ports';
import type { OrderPreviewView } from './integration-types';

type ConnectionRef = { workspaceId: string; connectionId: string };

/** Max rows the order preview keeps per connection (RFC 04). */
const PREVIEW_LIMIT = 50;

/**
 * In-memory InboundEventStore test fake (US20, RFC 04 task 34c). Dedupes
 * on (provider, dedupeKey) like the SQL unique index.
 */
export class InMemoryInboundEventStore implements InboundEventStore {
  readonly events = new Map<string, InboundEventRecord>();
  /** Insert time per event id; mirrors the SQL created_at default. */
  readonly receivedAt = new Map<string, Date>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async insert(event: InboundEventRecord) {
    const dupe = [...this.events.values()].some(
      (e) => e.provider === event.provider && e.dedupeKey === event.dedupeKey
    );
    if (dupe || this.events.has(event.id)) return false;
    this.events.set(event.id, { ...event });
    this.receivedAt.set(event.id, this.now());
    return true;
  }

  async find(id: string) {
    const row = this.events.get(id);
    return row ? { ...row } : null;
  }

  async markStatus(
    id: string,
    status: InboundEventStatus,
    patch: Partial<InboundEventRecord>
  ) {
    const row = this.events.get(id);
    if (!row) return;
    this.events.set(id, { ...row, ...patch, id, status });
  }

  /** Removes events received before `before` (30-day purge, O9). */
  async purgeBefore(before: Date) {
    let removed = 0;
    for (const [id, at] of this.receivedAt) {
      if (at.getTime() >= before.getTime()) continue;
      this.events.delete(id);
      this.receivedAt.delete(id);
      removed += 1;
    }
    return removed;
  }
}

/**
 * In-memory OrderPreviewStore: `replace` swaps a connection's preview for
 * the newest 50 rows (undated last) and returns how many it kept.
 */
export class InMemoryOrderPreviewStore implements OrderPreviewStore {
  readonly previews = new Map<string, OrderPreviewView[]>();

  async replace(
    ref: ConnectionRef,
    rows: readonly MarketplaceOrderPreviewRow[]
  ) {
    const kept = [...rows]
      .sort(
        (a, b) =>
          (b.orderedAt?.getTime() ?? -1) - (a.orderedAt?.getTime() ?? -1)
      )
      .slice(0, PREVIEW_LIMIT)
      .map((r) => ({ ...r, connectionId: ref.connectionId }));
    this.previews.set(previewKey(ref), kept);
    return kept.length;
  }

  async list(ref: ConnectionRef) {
    return (this.previews.get(previewKey(ref)) ?? []).map((r) => ({ ...r }));
  }
}

function previewKey(ref: ConnectionRef) {
  return `${ref.workspaceId}:${ref.connectionId}`;
}

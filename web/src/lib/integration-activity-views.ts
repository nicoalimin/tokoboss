/**
 * Story 18 activity feed view mapper (UTA-38 / US18, RFC 07 row 23a):
 * application IntegrationActivityItem → IntegrationActivityItemDto with an
 * ISO time and the mockup WIB label (Asia/Jakarta). Pure, no fetch/React.
 * Store health rows and KPIs are in integration-management-views.ts (23b).
 */
import type { IntegrationActivityItemDto } from '@tokoboss/contracts';
import type { IntegrationActivityItem } from '@tokoboss/application';

const WIB = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Jakarta',
});

/** Mockup format: `28 Okt 2026 · 18:12 WIB`. */
export function formatWibDateTime(date: Date): string {
  const p = Object.fromEntries(
    WIB.formatToParts(date).map((x) => [x.type, x.value])
  );
  return `${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute} WIB`;
}

export function toIntegrationActivityItemDto(
  item: IntegrationActivityItem
): IntegrationActivityItemDto {
  return {
    id: item.id,
    action: item.action,
    connectionId: item.connectionId,
    provider: item.provider,
    storeName: item.storeName,
    actorId: item.actorId,
    occurredAt: item.occurredAt.toISOString(),
    occurredAtWib: formatWibDateTime(item.occurredAt),
    summary: item.summary,
  };
}

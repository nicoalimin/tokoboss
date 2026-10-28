import type { InventorySyncAttentionItem } from '@tokoboss/contracts';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import {
  SYNC_ACTION_LABEL,
  SYNC_STATUS_LABEL,
} from '@/lib/inventory-sync-client';

/**
 * Calm Perlu tindakan banner at the top of /w/[workspaceId]/sku-mapping
 * (UTA-37 / US04, RFC 06 row 47): one line per needs_attention mapping —
 * SKU TokoBoss, Store SKU, store, Indonesian reason — and one action
 * (Coba lagi / Hubungkan ulang toko / Tautkan gudang) via onAction(item).
 * Renders nothing when empty; actions hidden when canEdit is false (Staff).
 * Row 50 SkuMappingPanel decides what each remediation does.
 */

const NAMES: Record<string, string> = INTEGRATION_PROVIDER_NAMES;

export interface InventorySyncAttentionBannerProps {
  items: InventorySyncAttentionItem[];
  onAction: (item: InventorySyncAttentionItem) => void;
  busyMappingId?: string | null;
  canEdit?: boolean;
}

export function InventorySyncAttentionBanner({
  items,
  onAction,
  busyMappingId = null,
  canEdit = true,
}: Readonly<InventorySyncAttentionBannerProps>) {
  if (items.length === 0) return null;
  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="inventory-sync-attention"
      className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
    >
      <p className="text-sm font-semibold text-amber-900">
        {SYNC_STATUS_LABEL.needs_attention}: {items.length} Store SKU belum
        tersinkron ke toko
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((a) => (
          <li
            key={a.mappingId}
            data-testid="inventory-sync-attention-item"
            data-mapping-id={a.mappingId}
            className="flex flex-col gap-2 rounded-lg bg-white p-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-0.5 text-sm">
              <p className="font-semibold text-neutral-900">
                SKU TokoBoss {a.skuCode} · Store SKU{' '}
                {a.storeSkuText ?? a.platformSkuId}
              </p>
              <p className="text-neutral-600">
                {NAMES[a.channel] ?? a.channel}
                {a.storeDisplayName ? ` · ${a.storeDisplayName}` : ''}
              </p>
              <p className="text-amber-800">{a.reason}</p>
            </div>
            {canEdit ? (
              <button
                type="button"
                data-testid="inventory-sync-attention-action"
                disabled={busyMappingId === a.mappingId}
                onClick={() => onAction(a)}
                className="min-h-[44px] shrink-0 rounded-lg border border-amber-300 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                {SYNC_ACTION_LABEL[a.remediation]}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

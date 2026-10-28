import type { InventorySyncHandlers } from '@/lib/use-inventory-sync';
import { MappingSyncConfigPopover } from './MappingSyncConfigPopover';
import {
  SubordinateStoreSlot,
  type SubordinateStoreSlotProps,
} from './SubordinateStoreSlot';

/**
 * Mapped Store SKU slot with Story 04 sync (UTA-37 / US04, RFC 06 row 50c):
 * SubordinateStoreSlot with its sync badge (row 49) plus an "Atur
 * sinkronisasi" disclosure holding MappingSyncConfigPopover (row 48) wired
 * to the row 50a hook handlers. Preview stock = TokoBoss stock in scope.
 * No `sync` or no state for the mapping → plain slot (badge shows Mati).
 */

export interface SyncedStoreSlotProps extends SubordinateStoreSlotProps {
  sync?: InventorySyncHandlers;
}

export function SyncedStoreSlot({
  sync,
  ...slot
}: Readonly<SyncedStoreSlotProps>) {
  const id = slot.mapping.mappingId;
  const state = sync?.states[id] ?? null;
  if (!sync || !state) return <SubordinateStoreSlot {...slot} />;
  return (
    <div data-testid="synced-store-slot" className="flex flex-col gap-2">
      <SubordinateStoreSlot {...slot} syncState={state} />
      <details className="rounded-xl border border-neutral-200 px-3 py-2">
        <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold text-neutral-800">
          Atur sinkronisasi
        </summary>
        <MappingSyncConfigPopover
          state={state}
          availableQty={slot.mapping.tokobossStockQty}
          onChange={(patch) => sync.onChange(id, patch)}
          onSync={() => sync.onSync(id)}
          busy={sync.busyMappingId !== null}
          canEdit={slot.canEdit}
        />
      </details>
    </div>
  );
}

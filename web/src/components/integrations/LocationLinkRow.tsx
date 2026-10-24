import type { IntegrationLocationLinkView } from '@tokoboss/contracts';
import type { WarehouseView } from '@/lib/catalog-client';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationLocationLinksCopy } from '@/lib/integration-location-links-copy';
import type { LocationSaveState } from '@/lib/use-location-links';

/**
 * One Pilih gudang sumber row (US20 / RFC 04 task 121l, CoS split of row
 * 121): location name (or unnamedLocation) and ID, then its source
 * warehouse. Admin gets a labelled select (Belum ditautkan = null clears;
 * disabled while saving) calling onLink; Manager sees the linked warehouse
 * as text. Save state: role="status" saving / saved, role="alert" failed.
 * Presentational: no fetch, no state; the 121m list owns the data.
 */

type Warehouse = Pick<WarehouseView, 'id' | 'code' | 'name'>;

export interface LocationLinkRowProps {
  location: IntegrationLocationLinkView;
  warehouses: readonly Warehouse[];
  isAdmin: boolean;
  /** From the 121k hook `saves`; undefined = idle. */
  save?: LocationSaveState;
  onLink: (externalLocationId: string, warehouseId: string | null) => void;
  lang?: IntegrationLang;
}

const warehouseText = (w: Warehouse) => `${w.name} (${w.code})`;

export function LocationLinkRow({
  location,
  warehouses,
  isAdmin,
  save,
  onLink,
  lang = 'id',
}: Readonly<LocationLinkRowProps>) {
  const copy = getIntegrationLocationLinksCopy(lang);
  const { externalLocationId: id, warehouseId } = location;
  const linked = warehouses.find((w) => w.id === warehouseId);
  const current = linked ? warehouseText(linked) : copy.notLinked;
  const failed = save === 'failed';
  return (
    <li
      data-testid="location-link-row"
      data-linked={warehouseId ? 'true' : 'false'}
      className="flex flex-wrap items-center gap-3 border-t border-neutral-200 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">
          {location.name?.trim() || copy.unnamedLocation}
        </p>
        <p className="text-xs text-neutral-600">
          {copy.locationIdLabel} {id}
        </p>
      </div>
      <div className="flex w-full flex-col gap-1 sm:w-64">
        {isAdmin ? (
          <label className="flex flex-col gap-1 text-xs font-semibold text-neutral-700">
            {copy.warehouseLabel}
            <select
              value={warehouseId ?? ''}
              disabled={save === 'saving'}
              onChange={(e) => onLink(id, e.target.value || null)}
              className="min-h-[44px] rounded-lg border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 disabled:opacity-50"
            >
              <option value="">{copy.notLinked}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {warehouseText(w)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-neutral-700">
            {copy.warehouseLabel}: {current}
          </p>
        )}
        {save ? (
          <p
            role={failed ? 'alert' : 'status'}
            className={`text-xs ${failed ? 'text-error-700' : 'text-neutral-600'}`}
          >
            {failed
              ? copy.saveFailed
              : save === 'saving'
                ? copy.saving
                : copy.saved}
          </p>
        ) : null}
      </div>
    </li>
  );
}

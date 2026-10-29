import type {
  IntegrationActivityItemDto,
  IntegrationConnectionView,
  UpdateConnectionControlsBody,
} from '@tokoboss/contracts';
import type { IntegrationLang } from '@/lib/integration-copy';
import type { StoreHealthRowView } from '@/lib/integration-management-views';
import { ConnectResult } from './ConnectResult';
import { IntegrationActivityTable } from './IntegrationActivityTable';
import { ListingReviewList } from './ListingReviewList';
import { LocationLinks } from './LocationLinks';
import { StoreCapabilityControlsCard } from './StoreCapabilityControlsCard';
import { StoreSetupChecklistCard } from './StoreSetupChecklistCard';

/**
 * Store detail connected screen (US20 / RFC 04 task 122d-i, CoS split of
 * 122d): mockup v2 screen 3. ConnectResult (115c) with step 2 "Pilih gudang
 * sumber" jumping to the LocationLinks section (121m) below it, then the
 * import review (ListingReviewList, 120g). Import counts show a dash (the
 * connection view has no import summary); step 1 links to Petakan Store SKU
 * filtered to this store (Story 03 / RFC 05 row 44) and step 3 (Story 04)
 * stays disabled. The 122d-ii screen body picks this screen.
 */

export const STORE_WAREHOUSES_ANCHOR = 'pilih-gudang';

export interface IntegrationStoreConnectedProps {
  workspaceId: string;
  connection: IntegrationConnectionView;
  /** useMembership role === 'admin'; Manager location rows are read-only. */
  isAdmin: boolean;
  lang?: IntegrationLang;
  /** Story 18 (RFC 07 row 38) health cards + activity; hidden if absent. */
  health?: StoreHealthRowView;
  activity?: readonly IntegrationActivityItemDto[];
  onControlsChange?: (body: UpdateConnectionControlsBody) => void;
  controlsNotice?: string;
}

export function IntegrationStoreConnected({
  workspaceId,
  connection,
  isAdmin,
  health,
  activity,
  onControlsChange,
  controlsNotice,
  lang = 'id',
}: Readonly<IntegrationStoreConnectedProps>) {
  const connectionId = connection.id;
  return (
    <div
      data-testid="integration-store-connected"
      className="flex flex-col gap-6"
    >
      <ConnectResult
        connection={connection}
        mapHref={`/w/${encodeURIComponent(workspaceId)}/produk/pemetaan?connectionId=${encodeURIComponent(connectionId)}`}
        warehouseHref={`#${STORE_WAREHOUSES_ANCHOR}`}
        lang={lang}
      />
      <div id={STORE_WAREHOUSES_ANCHOR} className="scroll-mt-4">
        <LocationLinks
          workspaceId={workspaceId}
          connectionId={connectionId}
          isAdmin={isAdmin}
          lang={lang}
        />
      </div>
      <ListingReviewList
        workspaceId={workspaceId}
        connectionId={connectionId}
        lang={lang}
      />
      {health ? (
        <div className="grid gap-4 md:grid-cols-2">
          <StoreCapabilityControlsCard
            row={health}
            isAdmin={isAdmin}
            onChange={isAdmin ? onControlsChange : undefined}
            notice={controlsNotice}
          />
          <StoreSetupChecklistCard row={health} />
        </div>
      ) : null}
      {activity ? <IntegrationActivityTable items={activity} /> : null}
    </div>
  );
}

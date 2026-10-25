import type { IntegrationConnectionView } from '@tokoboss/contracts';
import type { IntegrationLang } from '@/lib/integration-copy';
import { ConnectResult } from './ConnectResult';
import { ListingReviewList } from './ListingReviewList';
import { LocationLinks } from './LocationLinks';

/**
 * Store detail connected screen (US20 / RFC 04 task 122d-i, CoS split of
 * 122d): mockup v2 screen 3. ConnectResult (115c) with step 2 "Pilih gudang
 * sumber" jumping to the LocationLinks section (121m) below it, then the
 * import review (ListingReviewList, 120g). Import counts show a dash (the
 * connection view has no import summary); step 1 (Story 03) and step 3
 * (Story 04) stay disabled. The 122d-ii screen body picks this screen.
 */

export const STORE_WAREHOUSES_ANCHOR = 'pilih-gudang';

export interface IntegrationStoreConnectedProps {
  workspaceId: string;
  connection: IntegrationConnectionView;
  /** useMembership role === 'admin'; Manager location rows are read-only. */
  isAdmin: boolean;
  lang?: IntegrationLang;
}

export function IntegrationStoreConnected({
  workspaceId,
  connection,
  isAdmin,
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
    </div>
  );
}

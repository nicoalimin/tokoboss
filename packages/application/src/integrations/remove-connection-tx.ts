import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';

export interface RemoveConnectionTx {
  connections: Pick<ports.ConnectionStore, 'update'>;
  claims: Pick<ports.StoreClaimStore, 'release'>;
  listings: Pick<ports.ListingStore, 'setMappingsArchived'>;
}

export interface ConnectionRemovalInput {
  workspaceId: string;
  connectionId: string;
  row: ConnectionRecord;
  now: Date;
}

export interface ConnectionRemovalResult {
  saved: ConnectionRecord;
  claimReleased: boolean;
  mappingsArchived: number;
}

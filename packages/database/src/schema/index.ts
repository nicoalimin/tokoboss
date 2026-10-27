// Single entry point for Drizzle Kit (`schema` in drizzle.config.ts)
// and for the runtime adapter (`db.ts`).
export * from './helpers';
export * from './tenants';
export * from './audit-events';
export * from './jobs';
export * from './file-uploads';
export * from './workspace-members';
export * from './workspace-invites';
export * from './auth';
export * from './user-profiles';
export * from './catalog';
export * from './bundles';
export * from './product-imports';
export * from './legacy-store';
export * from './transfers';
export * from './purchase-orders';
export * from './stock-count-sessions';
export * from './stock-count-lines';
export * from './stock-count-entries';
export * from './marketplace-connections';
export * from './marketplace-oauth-states';
export * from './marketplace-store-claims';
export * from './marketplace-inbound-events';
export * from './marketplace-listings';
export * from './marketplace-location-links';
export * from './marketplace-order-previews';
export * from './sku-mapping-events';

import { auditEvents } from './audit-events';
import { authPasswordResets, authSessions, authUsers } from './auth';
import { catalogBundleLines } from './bundles';
import {
  catalogChannelMappings,
  catalogInventoryLevels,
  catalogProducts,
  catalogRecommendationStates,
  catalogStockLedger,
  catalogStockSettings,
  catalogVariants,
  catalogWarehouses,
} from './catalog';
import { fileUploads } from './file-uploads';
import { jobEvents, jobs } from './jobs';
import { products, stockMoves, stores } from './legacy-store';
import { productImportBatches, productImportRows } from './product-imports';
import { tenants } from './tenants';
import { userProfiles } from './user-profiles';
import { workspaceInvites } from './workspace-invites';
import { workspaceMembers } from './workspace-members';
import { catalogTransferItems, catalogTransfers } from './transfers';
import {
  catalogPurchaseOrderItems,
  catalogPurchaseOrders,
} from './purchase-orders';
import { stockCountSessions } from './stock-count-sessions';
import { stockCountLines } from './stock-count-lines';
import { stockCountEntries } from './stock-count-entries';
import {
  marketplaceConnections,
  marketplaceCredentials,
} from './marketplace-connections';
import { marketplaceOauthStates } from './marketplace-oauth-states';
import { marketplaceStoreClaims } from './marketplace-store-claims';
import { marketplaceInboundEvents } from './marketplace-inbound-events';
import { marketplaceListings } from './marketplace-listings';
import { marketplaceLocationLinks } from './marketplace-location-links';
import { marketplaceOrderPreviews } from './marketplace-order-previews';
import { catalogChannelMappingEvents } from './sku-mapping-events';

export const schema = {
  tenants,
  auditEvents,
  jobs,
  jobEvents,
  fileUploads,
  workspaceMembers,
  workspaceInvites,
  authUsers,
  authSessions,
  authPasswordResets,
  userProfiles,
  stores,
  products,
  stockMoves,
  catalogProducts,
  catalogVariants,
  catalogWarehouses,
  catalogInventoryLevels,
  catalogStockLedger,
  catalogStockSettings,
  catalogChannelMappings,
  catalogRecommendationStates,
  productImportBatches,
  productImportRows,
  catalogBundleLines,
  catalogTransfers,
  catalogTransferItems,
  catalogPurchaseOrders,
  catalogPurchaseOrderItems,
  stockCountSessions,
  stockCountLines,
  stockCountEntries,
  marketplaceConnections,
  marketplaceCredentials,
  marketplaceOauthStates,
  marketplaceStoreClaims,
  marketplaceInboundEvents,
  marketplaceListings,
  marketplaceLocationLinks,
  marketplaceOrderPreviews,
  catalogChannelMappingEvents,
};

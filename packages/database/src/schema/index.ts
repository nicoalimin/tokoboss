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
export * from './product-imports';
export * from './legacy-store';

import { auditEvents } from './audit-events';
import { authPasswordResets, authSessions, authUsers } from './auth';
import {
  catalogChannelMappings,
  catalogInventoryLevels,
  catalogProducts,
  catalogStockLedger,
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
  catalogChannelMappings,
  productImportBatches,
  productImportRows,
};

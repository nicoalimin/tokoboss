// Single entry point for Drizzle Kit (`schema` in drizzle.config.ts)
// and for the runtime adapter (`db.ts`).
export * from './helpers';
export * from './tenants';
export * from './audit-events';
export * from './jobs';
export * from './file-uploads';
export * from './workspace-members';
export * from './auth';
export * from './legacy-store';

import { auditEvents } from './audit-events';
import { authPasswordResets, authSessions, authUsers } from './auth';
import { fileUploads } from './file-uploads';
import { jobEvents, jobs } from './jobs';
import { products, stockMoves, stores } from './legacy-store';
import { tenants } from './tenants';
import { workspaceMembers } from './workspace-members';

export const schema = {
  tenants,
  auditEvents,
  jobs,
  jobEvents,
  fileUploads,
  workspaceMembers,
  authUsers,
  authSessions,
  authPasswordResets,
  stores,
  products,
  stockMoves,
};

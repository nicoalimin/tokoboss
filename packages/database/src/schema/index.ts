// Single entry point for Drizzle Kit (`schema` in drizzle.config.ts)
// and for the runtime adapter (`db.ts`).
export * from './helpers';
export * from './tenants';
export * from './audit-events';
export * from './jobs';
export * from './file-uploads';

import { auditEvents } from './audit-events';
import { fileUploads } from './file-uploads';
import { jobEvents, jobs } from './jobs';
import { tenants } from './tenants';

export const schema = { tenants, auditEvents, jobs, jobEvents, fileUploads };

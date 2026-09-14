// Single entry point for Drizzle Kit (`schema` in drizzle.config.ts)
// and for the runtime adapter (`db.ts`).
export * from './helpers';
export * from './tenants';
export * from './audit-events';
export * from './jobs';

import { auditEvents } from './audit-events';
import { jobEvents, jobs } from './jobs';
import { tenants } from './tenants';

export const schema = { tenants, auditEvents, jobs, jobEvents };

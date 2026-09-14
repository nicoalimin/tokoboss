// Single entry point for Drizzle Kit (`schema` in drizzle.config.ts)
// and for the runtime adapter (`db.ts`).
export * from './helpers.js';
export * from './tenants.js';
export * from './audit-events.js';

import { auditEvents } from './audit-events.js';
import { tenants } from './tenants.js';

export const schema = { tenants, auditEvents };

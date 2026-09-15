import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Workspace members — tenancy + RBAC baseline (UTA-19).
 *
 * Convention: a workspace IS the tenant isolation boundary
 * (`workspace_id` → `tenants.id`), same as `jobs.workspace_id` and
 * `file_uploads.workspace_id`. There is no separate `workspaces` table.
 *
 * - `user_id` is an opaque auth-provider id (never email/name/phone).
 * - `role` is Admin / Manager / Staff only (UTA-17 freeze, lowercase).
 * - `warehouse_scope` is an opaque warehouse id restricting Manager/Staff
 *   to one warehouse; null = all warehouses. Admins must have null scope.
 * - `status`: `active` | `deactivated` (invites come later; `invited`
 *   reserved for the invite flow).
 * - `auth_version` bumps on every role/scope/status change so sessions can
 *   be invalidated server-side (UTA-17 freeze).
 */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    warehouseScope: text('warehouse_scope'),
    status: text('status').notNull().default('active'),
    authVersion: integer('auth_version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('workspace_members_workspace_user_unique').on(
      t.workspaceId,
      t.userId
    ),
    index('workspace_members_workspace_role_idx').on(t.workspaceId, t.role),
    index('workspace_members_workspace_status_idx').on(
      t.workspaceId,
      t.status
    ),
    index('workspace_members_user_idx').on(t.userId),
  ]
);

export type WorkspaceMemberRow = typeof workspaceMembers.$inferSelect;
export type NewWorkspaceMemberRow = typeof workspaceMembers.$inferInsert;

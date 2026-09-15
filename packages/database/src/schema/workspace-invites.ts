import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcCreatedAt, utcTimestamps, uuidPk } from './helpers';

/**
 * Workspace invites — API-only invite flow (UTA-70).
 *
 * One row per invite ticket emailed (stub/interface only — no provider
 * polish here). The opaque bearer token is returned once at creation;
 * only its sha256 (`token_hash`, unique) is stored — mirroring
 * `auth_password_resets` (UTA-67). The invitee's `email` is stored
 * normalized (trimmed, lowercased) so `accept` can bind the ticket to the
 * credential row; it is PII, so use-cases must NEVER copy it (or the
 * token) into audit payloads or logs — see `assertTenancyPayloadSafe`
 * (`@tokoboss/application` tenancy safety).
 *
 * - `role` is Admin / Manager / Staff only (UTA-17 freeze, lowercase).
 * - `warehouse_scope`: opaque warehouse id for Manager/Staff; null = all
 *   warehouses. Admins must have null scope (enforced at the use-case
 *   boundary, same rule as `workspace_members`).
 * - `status`: `pending` | `accepted` | `revoked` | `expired`. Expiry is
 *   authoritative via `expires_at`; the `expired` status is stamped when a
 *   late accept is rejected so the row can never be retried into validity.
 * - `invited_by` is the opaque inviter user id (never email).
 */
export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Normalized invitee email (PII — never logged, never audited). */
    email: text('email').notNull(),
    role: text('role').notNull(),
    warehouseScope: text('warehouse_scope'),
    /** Hex sha256 of the opaque invite token. Unique, never the token. */
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    /** Opaque inviter user id. Never email. */
    invitedBy: text('invited_by'),
    acceptedAt: timestamp('accepted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: utcCreatedAt(),
    updatedAt: utcTimestamps().updatedAt,
  },
  (t) => [
    index('workspace_invites_workspace_idx').on(t.workspaceId),
    index('workspace_invites_workspace_email_idx').on(t.workspaceId, t.email),
    index('workspace_invites_token_hash_idx').on(t.tokenHash),
    index('workspace_invites_workspace_status_idx').on(t.workspaceId, t.status),
  ]
);

export type WorkspaceInviteRow = typeof workspaceInvites.$inferSelect;
export type NewWorkspaceInviteRow = typeof workspaceInvites.$inferInsert;

import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcCreatedAt, utcTimestamps, uuidPk } from './helpers';

/**
 * Password-auth credentials + server-side sessions (UTA-67).
 *
 * - `auth_users`: one row per email login. `email` is normalized
 *   (trimmed, lowercased) at the use-case boundary and unique.
 *   `password_hash` holds an opaque scrypt hash — never plaintext.
 * - `auth_sessions`: one row per device (unlimited concurrent devices).
 *   Only the token *hash* (`token_hash`, sha256) is stored; the opaque
 *   bearer token is returned once at sign-in. `last_seen_at` drives the
 *   sliding idle clock (web 30m / mobile 7d, no absolute expiry).
 *   `revoked_at` marks sign-out / revoke-all; `auth_version` snapshots the
 *   membership row so password-reset / Admin-deactivate bumps invalidate
 *   the session even with idle time left.
 * - `auth_password_resets`: single-use tickets (hash only, 1h expiry).
 *
 * Sessions and tickets are owned by the user row (`onDelete: cascade`);
 * workspace scoping rides on `workspace_id → tenants.id` like every other
 * business table.
 */
export const authUsers = pgTable(
  'auth_users',
  {
    id: uuidPk(),
    email: text('email').notNull().unique(),
    userId: text('user_id').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    ...utcTimestamps(),
  },
  (t) => [index('auth_users_user_id_idx').on(t.userId)]
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuidPk(),
    userId: text('user_id').notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** `web` | `mobile` — drives the idle TTL (30m vs 7d). */
    platform: text('platform').notNull(),
    deviceLabel: text('device_label'),
    /** Hex sha256 of the opaque bearer token. Unique, never the token. */
    tokenHash: text('token_hash').notNull().unique(),
    /** Membership `auth_version` captured at sign-in. */
    authVersion: integer('auth_version').notNull().default(1),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('auth_sessions_user_idx').on(t.userId),
    index('auth_sessions_workspace_user_idx').on(t.workspaceId, t.userId),
    index('auth_sessions_token_hash_idx').on(t.tokenHash),
  ]
);

export const authPasswordResets = pgTable(
  'auth_password_resets',
  {
    id: uuidPk(),
    userId: text('user_id').notNull(),
    /** Hex sha256 of the opaque reset ticket. Unique, never the ticket. */
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('auth_password_resets_user_idx').on(t.userId),
    index('auth_password_resets_token_hash_idx').on(t.tokenHash),
  ]
);

export type AuthUserRow = typeof authUsers.$inferSelect;
export type NewAuthUserRow = typeof authUsers.$inferInsert;
export type AuthSessionRow = typeof authSessions.$inferSelect;
export type NewAuthSessionRow = typeof authSessions.$inferInsert;
export type AuthPasswordResetRow = typeof authPasswordResets.$inferSelect;
export type NewAuthPasswordResetRow = typeof authPasswordResets.$inferInsert;

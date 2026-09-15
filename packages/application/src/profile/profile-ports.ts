import type { ProfileRecord } from './profile-types';

/**
 * Persistence port for `user_profiles`. Implementations:
 * - `DrizzleProfileStore` (`@tokoboss/database`) — Postgres/Neon.
 * - `InMemoryProfileStore` (here) — unit tests.
 *
 * Profiles are keyed by opaque `user_id` (global, not workspace-scoped).
 * There is exactly one row per user; `upsert` creates on first update.
 */
export interface ProfileStore {
  findByUserId(userId: string): Promise<ProfileRecord | null>;
  upsert(
    userId: string,
    patch: {
      displayName?: string | null;
      avatarUploadId?: string | null;
    },
    now?: Date
  ): Promise<ProfileRecord>;
}

import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { fileUploads } from './file-uploads';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Personal profiles — one row per opaque user id (UTA-72).
 *
 * Global (not workspace-scoped): the same `user_id` shared by
 * `auth_users.user_id` and `workspace_members.user_id`. Display name is a
 * user-owned string; the avatar is a *reference* to a private
 * `file_uploads` row (Blob contents never land in Postgres).
 *
 * - `user_id` is unique and owned by the auth credential
 *   (no cascade — profiles survive credential rotation; cleanup is explicit).
 * - `avatar_upload_id` references `file_uploads.id` with `SET NULL` so
 *   deleting the underlying private object clears the avatar instead of
 *   orphaning the profile.
 */
export const userProfiles = pgTable(
  'user_profiles',
  {
    id: uuidPk(),
    userId: text('user_id').notNull().unique(),
    displayName: text('display_name'),
    avatarUploadId: uuid('avatar_upload_id').references(() => fileUploads.id, {
      onDelete: 'set null',
    }),
    ...utcTimestamps(),
  },
  (t) => [index('user_profiles_user_id_idx').on(t.userId)]
);

export type UserProfileRow = typeof userProfiles.$inferSelect;
export type NewUserProfileRow = typeof userProfiles.$inferInsert;

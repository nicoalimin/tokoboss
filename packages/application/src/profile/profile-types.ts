/**
 * Personal profile vocabulary (UTA-72).
 *
 * A profile is global per opaque `user_id` (not per workspace) — the same
 * `user_id` shared by `auth_users.user_id` and
 * `workspace_members.user_id`. Display name and avatar are user-owned;
 * workspace scoping only gates *which* avatar file may be referenced
 * (the file must live in the caller's workspace).
 */

export interface ProfileRecord {
  /** Opaque user id shared with auth + membership rows. */
  userId: string;
  /** Trimmed display name, or null when never set. */
  displayName: string | null;
  /** `file_uploads.id` reference (private Blob), or null when never set. */
  avatarUploadId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Client-safe profile projection. Email is the caller's own login email
 * (safe to return to self, never logged). No hashes, no tokens.
 */
export interface ProfileView {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUploadId: string | null;
  updatedAt: string;
}

export function toProfileView(
  profile: ProfileRecord,
  email: string
): ProfileView {
  return {
    userId: profile.userId,
    email,
    displayName: profile.displayName,
    avatarUploadId: profile.avatarUploadId,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/** Max display-name length (keeps UI + audit payloads bounded). */
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;

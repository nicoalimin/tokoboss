import {
  InvalidCredentialsError,
  PasswordPolicyError,
} from '../auth/auth-errors';
import { validatePassword as enforcePasswordPolicy } from '../auth/password-policy';
import type {
  CredentialStore,
  PasswordHasher,
  SessionStore,
} from '../auth/auth-ports';
import type {
  TenancyAuditSink,
  WorkspaceMemberStore,
} from '../tenancy/tenancy-ports';
import { emitSecurityEvent } from '../tenancy/tenancy-use-cases';
import { requireUserId } from '../tenancy/tenancy-safety';
import type { FileUploadStore } from '../uploads/upload-ports';
import {
  ProfileForbiddenError,
  ProfileValidationError,
} from './profile-errors';
import {
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  toProfileView,
  type ProfileView,
} from './profile-types';
import type { ProfileStore } from './profile-ports';

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function validateDisplayName(value: unknown): string | null {
  if (value === undefined) {
    throw new ProfileValidationError('displayName must be provided.');
  }
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new ProfileValidationError('displayName must be a string.');
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) {
    throw new ProfileValidationError('displayName must not be empty.');
  }
  if (trimmed.length > PROFILE_DISPLAY_NAME_MAX_LENGTH) {
    throw new ProfileValidationError(
      `displayName must be at most ${PROFILE_DISPLAY_NAME_MAX_LENGTH} characters.`
    );
  }
  if (EMAIL_RE.test(trimmed)) {
    throw new ProfileValidationError('displayName must not be an email.');
  }
  return trimmed;
}

export interface ProfileDeps {
  credentials: CredentialStore;
  profiles: ProfileStore;
}

export interface ProfileUpdateDeps extends ProfileDeps {
  uploads: FileUploadStore;
}

export interface PasswordChangeDeps {
  credentials: CredentialStore;
  sessions: SessionStore;
  members: WorkspaceMemberStore;
  hasher: PasswordHasher;
  audit: TenancyAuditSink;
}

/**
 * Read the caller's own profile. Never throws for a missing profile row —
 * first read returns defaults (null display name / avatar) without
 * persisting, so reads stay side-effect free. The credential must exist
 * (the session validator already proved membership); a missing credential
 * is a forbidden access, never a 404 oracle.
 */
export async function getMe(
  deps: ProfileDeps,
  userId: string
): Promise<ProfileView> {
  const id = requireUserId(userId);
  const credential = await deps.credentials.findByUserId(id);
  if (!credential) throw new ProfileForbiddenError();
  const profile = await deps.profiles.findByUserId(id);
  const now = new Date();
  if (!profile) {
    return {
      userId: id,
      email: credential.email,
      displayName: null,
      avatarUploadId: null,
      updatedAt: now.toISOString(),
    };
  }
  return toProfileView(profile, credential.email);
}

export interface UpdateProfileInput {
  userId: string;
  workspaceId: string;
  displayName?: string | null;
  avatarUploadId?: string | null;
  correlationId?: string;
}

/**
 * Update the caller's own profile fields. There is no target-user
 * parameter — cross-user updates are structurally impossible at this
 * boundary; routes must never accept a user id from the client.
 *
 * - `displayName`: trimmed 1..80 chars, never an email. `null` clears it.
 * - `avatarUploadId`: must reference a `completed` image `file_uploads`
 *   row in the caller's workspace (private Blob reference, never bytes or
 *   URLs). `null` clears it. Unknown or cross-workspace ids are denied
 *   with `ProfileForbiddenError` (indistinguishable, no oracle).
 */
export async function updateProfile(
  deps: ProfileUpdateDeps,
  input: UpdateProfileInput,
  now = new Date()
): Promise<ProfileView> {
  const userId = requireUserId(input.userId);
  const workspaceId = (input.workspaceId ?? '').trim();
  if (workspaceId.length === 0) {
    throw new ProfileValidationError('workspaceId must not be empty.');
  }
  const credential = await deps.credentials.findByUserId(userId);
  if (!credential) throw new ProfileForbiddenError();

  const patch: { displayName?: string | null; avatarUploadId?: string | null } =
    {};
  let touched = false;

  if (input.displayName !== undefined) {
    patch.displayName = validateDisplayName(input.displayName);
    touched = true;
  }

  if (input.avatarUploadId !== undefined) {
    const avatarId = input.avatarUploadId;
    if (avatarId === null) {
      patch.avatarUploadId = null;
      touched = true;
    } else if (typeof avatarId !== 'string' || avatarId.trim().length === 0) {
      throw new ProfileValidationError('avatarUploadId must not be empty.');
    } else {
      const id = avatarId.trim();
      const upload = await deps.uploads.findById(id, workspaceId);
      if (!upload) throw new ProfileForbiddenError();
      if (upload.status !== 'completed') {
        throw new ProfileValidationError('Avatar upload is not completed.');
      }
      if (!upload.contentType.startsWith('image/')) {
        throw new ProfileValidationError('Avatar must be an image upload.');
      }
      patch.avatarUploadId = upload.id;
      touched = true;
    }
  }

  if (!touched) {
    throw new ProfileValidationError(
      'Nothing to update. Provide displayName and/or avatarUploadId.'
    );
  }

  const saved = await deps.profiles.upsert(userId, patch, now);
  return toProfileView(saved, credential.email);
}

export interface ChangePasswordInput {
  userId: string;
  workspaceId: string;
  currentPassword: string;
  newPassword: string;
  correlationId?: string;
}

/**
 * Change password while authenticated (UTA-72, UTA-17 freeze).
 *
 * - Verifies the current password (`InvalidCredentialsError` when wrong —
 *   safe to disclose to the session holder, no oracle for outsiders).
 * - Enforces the shared policy (min 8 + denylist, `PasswordPolicyError`).
 * - Rotates the hash, revokes ALL sessions, bumps EVERY membership
 *   `auth_version` (so even sessions validated against a stale read fail),
 *   and emits `security.password_change` + `security.forced_sign_out`
 *   (`password_change`) — the reset-flow parity required by UTA-17.
 */
export async function changePassword(
  deps: PasswordChangeDeps,
  input: ChangePasswordInput,
  now = new Date()
): Promise<{ revokedCount: number }> {
  const userId = requireUserId(input.userId);
  const workspaceId = (input.workspaceId ?? '').trim();
  if (workspaceId.length === 0) {
    throw new ProfileValidationError('workspaceId must not be empty.');
  }
  if (
    typeof input.currentPassword !== 'string' ||
    input.currentPassword.length === 0
  ) {
    throw new InvalidCredentialsError();
  }
  try {
    enforcePasswordPolicy(input.newPassword);
  } catch (err) {
    if (err instanceof PasswordPolicyError) throw err;
    throw new PasswordPolicyError();
  }

  const credential = await deps.credentials.findByUserId(userId);
  if (!credential) throw new ProfileForbiddenError();

  const ok = await deps.hasher.verify(
    credential.passwordHash,
    input.currentPassword
  );
  if (!ok) throw new InvalidCredentialsError();
  if (input.currentPassword === input.newPassword) {
    throw new PasswordPolicyError(
      'New password must be different from the current password.'
    );
  }

  const passwordHash = await deps.hasher.hash(input.newPassword);
  await deps.credentials.updatePasswordHash(userId, passwordHash);
  const revokedCount = await deps.sessions.revokeAllByUser(userId, now);

  const memberships = await deps.members.listByUser(userId);
  for (const m of memberships) {
    await deps.members.update(m.id, m.workspaceId, {
      authVersion: m.authVersion + 1,
    });
  }

  await emitSecurityEvent(deps.audit, {
    workspaceId,
    action: 'security.password_change',
    actorId: userId,
    correlationId: input.correlationId,
    payload: { workspaceId, userId },
  });
  await emitSecurityEvent(deps.audit, {
    workspaceId,
    action: 'security.forced_sign_out',
    actorId: userId,
    correlationId: input.correlationId,
    payload: { workspaceId, userId, reason: 'password_change' },
  });

  return { revokedCount };
}

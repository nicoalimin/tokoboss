import { describe, expect, it } from 'vitest';
import {
  InMemoryTenancyStore,
  addMember,
  adminContext,
  createWorkspace,
} from '../../tenancy/index';
import {
  InMemoryCredentialStore,
  InMemorySessionStore,
  ScryptPasswordHasher,
  SignInRateLimiter,
  InMemoryPasswordResetStore,
  normalizeEmail,
  signIn,
  validateSession,
  listSessions,
  InvalidCredentialsError,
  PasswordPolicyError,
} from '../../auth/index';
import { InMemoryProfileStore } from '../in-memory-profile-store';
import { changePassword, getMe, updateProfile } from '../profile-use-cases';
import { ProfileForbiddenError } from '../profile-errors';
import { InMemoryUploadStore } from '../../uploads/in-memory-upload-store';
import {
  completeUpload,
  requestUploadToken,
} from '../../uploads/upload-use-cases';
import type { ObjectStoragePort } from '@tokoboss/domain';

const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1, keyLen: 16 });

/** Layer-clean fake: application tests must not import @tokoboss/integrations. */
function fakeStorage(): ObjectStoragePort {
  let seq = 0;
  return {
    kind: 'fake-blob',
    access: 'private',
    issueUploadToken: async (input) => {
      seq += 1;
      return {
        pathname: input.pathname,
        uploadToken: `fake_upl_${seq}`,
        uploadUrl: `fake://upload/${encodeURIComponent(input.pathname)}`,
        expiresAt: new Date(Date.now() + 900_000),
        access: 'private',
      };
    },
    createDownloadGrant: async (pathname) => ({
      pathname,
      downloadUrl: `fake://download/${encodeURIComponent(pathname)}?grant=${(seq += 1)}`,
      expiresAt: new Date(Date.now() + 300_000),
    }),
    deleteObject: async () => {},
  };
}

async function newFixture(password = 'correct-horse-29') {
  const tenancy = new InMemoryTenancyStore();
  const credentials = new InMemoryCredentialStore();
  const sessions = new InMemorySessionStore();
  const resets = new InMemoryPasswordResetStore();
  const profiles = new InMemoryProfileStore();
  const uploads = new InMemoryUploadStore();
  const deps = {
    credentials,
    sessions,
    resets,
    members: tenancy,
    hasher,
    audit: tenancy.audit,
    rateLimiter: new SignInRateLimiter(),
  };
  const email = 'owner@example.com';
  const userId = 'user_owner_1';
  const { workspaceId } = await createWorkspace(
    tenancy,
    tenancy,
    {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2, 8)}`,
      initialAdminUserId: 'user_admin_seed',
    },
    tenancy.audit
  );
  await addMember(
    tenancy,
    {
      ctx: adminContext(workspaceId, 'user_admin_seed'),
      workspaceId,
      userId,
      role: 'manager',
      warehouseScope: null,
    },
    tenancy.audit
  );
  await credentials.create({
    email: normalizeEmail(email),
    userId,
    passwordHash: await hasher.hash(password),
  });
  return {
    deps,
    tenancy,
    credentials,
    sessions,
    profiles,
    uploads,
    workspaceId,
    email,
    password,
    userId,
  };
}

async function completedAvatar(
  uploads: InMemoryUploadStore,
  workspaceId: string,
  key = 'avatar-1'
) {
  const blob = fakeStorage();
  const issued = await requestUploadToken(uploads, blob, {
    workspaceId,
    purpose: 'avatar',
    filename: 'me.png',
    contentType: 'image/png',
    byteSize: 100,
    role: 'admin',
    idempotencyKey: key,
  });
  const done = await completeUpload(uploads, {
    workspaceId,
    uploadId: issued.upload.id,
    pathname: issued.pathname,
    byteSize: 100,
  });
  return done.upload;
}

describe('getMe / updateProfile', () => {
  it('reads defaults without persisting, then updates display name', async () => {
    const f = await newFixture();
    const before = await getMe(
      { credentials: f.credentials, profiles: f.profiles },
      f.userId
    );
    expect(before).toMatchObject({
      userId: f.userId,
      email: f.email,
      displayName: null,
      avatarUploadId: null,
    });
    expect(await f.profiles.findByUserId(f.userId)).toBeNull();

    const updated = await updateProfile(
      { credentials: f.credentials, profiles: f.profiles, uploads: f.uploads },
      {
        userId: f.userId,
        workspaceId: f.workspaceId,
        displayName: '  Budi  Santoso ',
      }
    );
    expect(updated.displayName).toBe('Budi Santoso');
    expect(updated.email).toBe(f.email);
  });

  it('links a completed avatar upload in the same workspace', async () => {
    const f = await newFixture();
    const avatar = await completedAvatar(f.uploads, f.workspaceId);
    const updated = await updateProfile(
      { credentials: f.credentials, profiles: f.profiles, uploads: f.uploads },
      {
        userId: f.userId,
        workspaceId: f.workspaceId,
        avatarUploadId: avatar.id,
      }
    );
    expect(updated.avatarUploadId).toBe(avatar.id);
  });

  it('denies cross-workspace avatar references without an oracle', async () => {
    const f = await newFixture();
    const avatar = await completedAvatar(f.uploads, f.workspaceId);
    await expect(
      updateProfile(
        {
          credentials: f.credentials,
          profiles: f.profiles,
          uploads: f.uploads,
        },
        {
          userId: f.userId,
          workspaceId: 'ws_intruder',
          avatarUploadId: avatar.id,
        }
      )
    ).rejects.toBeInstanceOf(ProfileForbiddenError);
  });

  it('rejects invalid display names and pending/non-image avatars', async () => {
    const f = await newFixture();
    const base = {
      credentials: f.credentials,
      profiles: f.profiles,
      uploads: f.uploads,
    };
    await expect(
      updateProfile(base, {
        userId: f.userId,
        workspaceId: f.workspaceId,
        displayName: '   ',
      })
    ).rejects.toThrow();
    await expect(
      updateProfile(base, {
        userId: f.userId,
        workspaceId: f.workspaceId,
        displayName: 'owner@example.com',
      })
    ).rejects.toThrow();
    await expect(
      updateProfile(base, {
        userId: f.userId,
        workspaceId: f.workspaceId,
      })
    ).rejects.toThrow(/Nothing to update/);

    const blob = fakeStorage();
    const pending = await requestUploadToken(f.uploads, blob, {
      workspaceId: f.workspaceId,
      purpose: 'avatar',
      filename: 'pending.png',
      contentType: 'image/png',
      byteSize: 50,
      role: 'admin',
      idempotencyKey: 'avatar-pending',
    });
    await expect(
      updateProfile(base, {
        userId: f.userId,
        workspaceId: f.workspaceId,
        avatarUploadId: pending.upload.id,
      })
    ).rejects.toThrow(/not completed/);
  });
});

describe('changePassword', () => {
  it('rotates the hash, revokes all sessions, bumps auth_version, emits security events', async () => {
    const f = await newFixture();
    const a = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    const b = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'mobile',
    });
    expect(await listSessions(f.deps, f.userId)).toHaveLength(2);

    const { revokedCount } = await changePassword(
      {
        credentials: f.credentials,
        sessions: f.sessions,
        members: f.tenancy,
        hasher,
        audit: f.tenancy.audit,
      },
      {
        userId: f.userId,
        workspaceId: f.workspaceId,
        currentPassword: f.password,
        newPassword: 'fresh-noodles-42',
      }
    );
    expect(revokedCount).toBe(2);
    expect(await validateSession(f.deps, a.token)).toBeNull();
    expect(await validateSession(f.deps, b.token)).toBeNull();
    expect(await listSessions(f.deps, f.userId)).toHaveLength(0);

    await expect(
      signIn(f.deps, {
        email: f.email,
        password: f.password,
        workspaceId: f.workspaceId,
        platform: 'web',
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    const renewed = await signIn(f.deps, {
      email: f.email,
      password: 'fresh-noodles-42',
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    expect(renewed.userId).toBe(f.userId);

    const actions = f.tenancy.auditEvents.map((e) => e.action);
    expect(actions).toContain('security.password_change');
    expect(actions).toContain('security.forced_sign_out');
    const forced = f.tenancy.auditEvents.filter(
      (e) => e.action === 'security.forced_sign_out'
    );
    expect(forced[forced.length - 1]).toMatchObject({
      category: 'security',
      actorId: f.userId,
      payload: {
        workspaceId: f.workspaceId,
        userId: f.userId,
        reason: 'password_change',
      },
    });
  });

  it('rejects wrong current password and weak / same-as-current replacements', async () => {
    const f = await newFixture();
    const wire = {
      credentials: f.credentials,
      sessions: f.sessions,
      members: f.tenancy,
      hasher,
      audit: f.tenancy.audit,
    };
    await expect(
      changePassword(wire, {
        userId: f.userId,
        workspaceId: f.workspaceId,
        currentPassword: 'wrong-password-1',
        newPassword: 'fresh-noodles-42',
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      changePassword(wire, {
        userId: f.userId,
        workspaceId: f.workspaceId,
        currentPassword: f.password,
        newPassword: 'password123',
      })
    ).rejects.toBeInstanceOf(PasswordPolicyError);
    await expect(
      changePassword(wire, {
        userId: f.userId,
        workspaceId: f.workspaceId,
        currentPassword: f.password,
        newPassword: f.password,
      })
    ).rejects.toBeInstanceOf(PasswordPolicyError);
  });

  it('keeps secrets out of audit events and views', async () => {
    const f = await newFixture('s3cret-noodles-77');
    await changePassword(
      {
        credentials: f.credentials,
        sessions: f.sessions,
        members: f.tenancy,
        hasher,
        audit: f.tenancy.audit,
      },
      {
        userId: f.userId,
        workspaceId: f.workspaceId,
        currentPassword: 's3cret-noodles-77',
        newPassword: 'other-noodles-88',
      }
    );
    const wire = JSON.stringify(f.tenancy.auditEvents);
    expect(wire).not.toContain('s3cret-noodles-77');
    expect(wire).not.toContain('other-noodles-88');
    expect(wire).not.toContain(f.email);
    expect(wire).not.toMatch(/passwordHash|tokenHash/);
  });
});

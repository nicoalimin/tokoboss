import { and, eq, isNull } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { authPasswordResets, authSessions, authUsers } from '../schema/index';
import type {
  AuthPasswordResetRow,
  AuthSessionRow,
  AuthUserRow,
} from '../schema/index';
import type {
  CredentialRecord,
  CredentialStore,
  PasswordResetRecord,
  PasswordResetStore,
  SessionRecord,
  SessionStore,
} from '@tokoboss/application';

type DbOrTx = Transaction | DatabaseHandle;

function toCredential(row: AuthUserRow): CredentialRecord {
  return {
    id: row.id,
    email: row.email,
    userId: row.userId,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSession(row: AuthSessionRow): SessionRecord {
  const platform = row.platform === 'mobile' ? 'mobile' : 'web';
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    platform,
    deviceLabel: row.deviceLabel,
    tokenHash: row.tokenHash,
    authVersion: row.authVersion,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

function toReset(row: AuthPasswordResetRow): PasswordResetRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ((err as { code?: unknown }).code === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === '23505'
  );
}

/**
 * Postgres-backed credential store (UTA-67). Emails are normalized at the
 * use-case boundary; this store persists hashes only.
 */
export class DrizzleCredentialStore implements CredentialStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleCredentialStore {
    return new DrizzleCredentialStore(tx);
  }

  async findByEmail(normalizedEmail: string): Promise<CredentialRecord | null> {
    const rows = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, normalizedEmail))
      .limit(1);
    const row = rows[0];
    return row ? toCredential(row) : null;
  }

  async findByUserId(userId: string): Promise<CredentialRecord | null> {
    const rows = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.userId, userId))
      .limit(1);
    const row = rows[0];
    return row ? toCredential(row) : null;
  }

  async create(input: {
    email: string;
    userId: string;
    passwordHash: string;
  }): Promise<CredentialRecord> {
    try {
      const inserted = await this.db
        .insert(authUsers)
        .values({
          email: input.email,
          userId: input.userId,
          passwordHash: input.passwordHash,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert credential');
      return toCredential(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error('CREDENTIAL_CONFLICT');
      throw err;
    }
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string
  ): Promise<void> {
    const updated = await this.db
      .update(authUsers)
      .set({ passwordHash })
      .where(eq(authUsers.userId, userId))
      .returning({ id: authUsers.id });
    if (!updated[0]) throw new Error('CREDENTIAL_NOT_FOUND');
  }
}

/**
 * Postgres-backed session store (UTA-67). Token hashes only — the opaque
 * token never reaches the database.
 */
export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleSessionStore {
    return new DrizzleSessionStore(tx);
  }

  async create(input: {
    userId: string;
    workspaceId: string;
    platform: 'web' | 'mobile';
    deviceLabel: string | null;
    tokenHash: string;
    authVersion: number;
    lastSeenAt: Date;
  }): Promise<SessionRecord> {
    try {
      const inserted = await this.db
        .insert(authSessions)
        .values({
          userId: input.userId,
          workspaceId: input.workspaceId,
          platform: input.platform,
          deviceLabel: input.deviceLabel,
          tokenHash: input.tokenHash,
          authVersion: input.authVersion,
          lastSeenAt: input.lastSeenAt,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert session');
      return toSession(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error('SESSION_CONFLICT');
      throw err;
    }
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    return row ? toSession(row) : null;
  }

  async touch(id: string, lastSeenAt: Date): Promise<void> {
    await this.db
      .update(authSessions)
      .set({ lastSeenAt })
      .where(eq(authSessions.id, id));
  }

  async markRevoked(id: string, revokedAt: Date): Promise<void> {
    const rows = await this.db
      .select({ revokedAt: authSessions.revokedAt })
      .from(authSessions)
      .where(eq(authSessions.id, id))
      .limit(1);
    if (!rows[0] || rows[0].revokedAt) return;
    await this.db
      .update(authSessions)
      .set({ revokedAt })
      .where(eq(authSessions.id, id));
  }

  async revokeByTokenHash(
    tokenHash: string,
    revokedAt: Date
  ): Promise<boolean> {
    const updated = await this.db
      .update(authSessions)
      .set({ revokedAt })
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          isNull(authSessions.revokedAt)
        )
      )
      .returning({ id: authSessions.id });
    return Boolean(updated[0]);
  }

  async revokeAllByUser(userId: string, revokedAt: Date): Promise<number> {
    const updated = await this.db
      .update(authSessions)
      .set({ revokedAt })
      .where(
        and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt))
      )
      .returning({ id: authSessions.id });
    return updated.length;
  }

  async listByUser(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, userId));
    return rows.map(toSession);
  }
}

/** Postgres-backed password-reset ticket store (hashes only). */
export class DrizzlePasswordResetStore implements PasswordResetStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzlePasswordResetStore {
    return new DrizzlePasswordResetStore(tx);
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord> {
    try {
      const inserted = await this.db
        .insert(authPasswordResets)
        .values({
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert reset ticket');
      return toReset(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error('RESET_CONFLICT');
      throw err;
    }
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetRecord | null> {
    const rows = await this.db
      .select()
      .from(authPasswordResets)
      .where(eq(authPasswordResets.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    return row ? toReset(row) : null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.db
      .update(authPasswordResets)
      .set({ usedAt })
      .where(eq(authPasswordResets.id, id));
  }
}

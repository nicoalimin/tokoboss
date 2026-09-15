import type {
  CredentialRecord,
  PasswordResetRecord,
  SessionRecord,
} from './auth-types';
import type {
  CredentialStore,
  PasswordResetStore,
  SessionStore,
} from './auth-ports';

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clone(v);
    }
    return out as T;
  }
  return value;
}

/**
 * In-memory credential + session + reset stores for unit tests (UTA-67).
 * Mirror the Postgres contracts: email uniqueness, token-hash uniqueness,
 * revoke semantics. Never log inputs.
 */
export class InMemoryCredentialStore implements CredentialStore {
  private readonly byId = new Map<string, CredentialRecord>();
  private readonly byEmail = new Map<string, string>();
  private seq = 0;

  async findByEmail(normalizedEmail: string): Promise<CredentialRecord | null> {
    const id = this.byEmail.get(normalizedEmail);
    const row = id ? this.byId.get(id) : undefined;
    return row ? clone(row) : null;
  }

  async findByUserId(userId: string): Promise<CredentialRecord | null> {
    for (const row of this.byId.values()) {
      if (row.userId === userId) return clone(row);
    }
    return null;
  }

  async create(input: {
    email: string;
    userId: string;
    passwordHash: string;
  }): Promise<CredentialRecord> {
    if (this.byEmail.has(input.email)) {
      throw new Error('CREDENTIAL_CONFLICT');
    }
    const now = new Date();
    this.seq += 1;
    const row: CredentialRecord = {
      id: `cred_${String(this.seq).padStart(4, '0')}`,
      email: input.email,
      userId: input.userId,
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(row.id, row);
    this.byEmail.set(input.email, row.id);
    return clone(row);
  }

  async updatePasswordHash(
    userId: string,
    passwordHash: string
  ): Promise<void> {
    for (const row of this.byId.values()) {
      if (row.userId === userId) {
        row.passwordHash = passwordHash;
        row.updatedAt = new Date();
        return;
      }
    }
    throw new Error('CREDENTIAL_NOT_FOUND');
  }
}

export class InMemorySessionStore implements SessionStore {
  private readonly byId = new Map<string, SessionRecord>();
  private readonly byToken = new Map<string, string>();
  private seq = 0;

  async create(input: {
    userId: string;
    workspaceId: string;
    platform: 'web' | 'mobile';
    deviceLabel: string | null;
    tokenHash: string;
    authVersion: number;
    lastSeenAt: Date;
  }): Promise<SessionRecord> {
    if (this.byToken.has(input.tokenHash)) {
      throw new Error('SESSION_CONFLICT');
    }
    this.seq += 1;
    const row: SessionRecord = {
      id: `sess_${String(this.seq).padStart(4, '0')}`,
      userId: input.userId,
      workspaceId: input.workspaceId,
      platform: input.platform,
      deviceLabel: input.deviceLabel,
      tokenHash: input.tokenHash,
      authVersion: input.authVersion,
      lastSeenAt: new Date(input.lastSeenAt),
      revokedAt: null,
      createdAt: new Date(),
    };
    this.byId.set(row.id, row);
    this.byToken.set(input.tokenHash, row.id);
    return clone(row);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const id = this.byToken.get(tokenHash);
    const row = id ? this.byId.get(id) : undefined;
    return row ? clone(row) : null;
  }

  async touch(id: string, lastSeenAt: Date): Promise<void> {
    const row = this.byId.get(id);
    if (!row) throw new Error('SESSION_NOT_FOUND');
    row.lastSeenAt = new Date(lastSeenAt);
  }

  async markRevoked(id: string, revokedAt: Date): Promise<void> {
    const row = this.byId.get(id);
    if (!row) return;
    if (!row.revokedAt) row.revokedAt = new Date(revokedAt);
  }

  async revokeByTokenHash(
    tokenHash: string,
    revokedAt: Date
  ): Promise<boolean> {
    const id = this.byToken.get(tokenHash);
    if (!id) return false;
    const row = this.byId.get(id);
    if (!row || row.revokedAt) return false;
    row.revokedAt = new Date(revokedAt);
    return true;
  }

  async revokeAllByUser(userId: string, revokedAt: Date): Promise<number> {
    let count = 0;
    for (const row of this.byId.values()) {
      if (row.userId === userId && !row.revokedAt) {
        row.revokedAt = new Date(revokedAt);
        count += 1;
      }
    }
    return count;
  }

  async listByUser(userId: string): Promise<SessionRecord[]> {
    const out: SessionRecord[] = [];
    for (const row of this.byId.values()) {
      if (row.userId === userId) out.push(clone(row));
    }
    return out;
  }
}

export class InMemoryPasswordResetStore implements PasswordResetStore {
  private readonly byId = new Map<string, PasswordResetRecord>();
  private readonly byToken = new Map<string, string>();
  private seq = 0;

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord> {
    if (this.byToken.has(input.tokenHash)) {
      throw new Error('RESET_CONFLICT');
    }
    this.seq += 1;
    const row: PasswordResetRecord = {
      id: `rst_${String(this.seq).padStart(4, '0')}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
      usedAt: null,
      createdAt: new Date(),
    };
    this.byId.set(row.id, row);
    this.byToken.set(input.tokenHash, row.id);
    return clone(row);
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<PasswordResetRecord | null> {
    const id = this.byToken.get(tokenHash);
    const row = id ? this.byId.get(id) : undefined;
    return row ? clone(row) : null;
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    const row = this.byId.get(id);
    if (!row) throw new Error('RESET_NOT_FOUND');
    row.usedAt = new Date(usedAt);
  }
}

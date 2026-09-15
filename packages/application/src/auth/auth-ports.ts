import type {
  CredentialRecord,
  PasswordResetRecord,
  SessionRecord,
} from './auth-types';

/** Opaque password hashing (scrypt in production wiring, stub in tests). */
export interface PasswordHasher {
  hash(plaintext: string): Promise<string>;
  verify(hash: string, plaintext: string): Promise<boolean>;
}

/** Email → credential lookup. Implementations never log the email. */
export interface CredentialStore {
  findByEmail(normalizedEmail: string): Promise<CredentialRecord | null>;
  findByUserId(userId: string): Promise<CredentialRecord | null>;
  create(input: {
    email: string;
    userId: string;
    passwordHash: string;
  }): Promise<CredentialRecord>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

/** Server-side session rows keyed by token hash (hashes only in DB). */
export interface SessionStore {
  create(input: {
    userId: string;
    workspaceId: string;
    platform: 'web' | 'mobile';
    deviceLabel: string | null;
    tokenHash: string;
    authVersion: number;
    lastSeenAt: Date;
  }): Promise<SessionRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  touch(id: string, lastSeenAt: Date): Promise<void>;
  markRevoked(id: string, revokedAt: Date): Promise<void>;
  revokeByTokenHash(tokenHash: string, revokedAt: Date): Promise<boolean>;
  revokeAllByUser(userId: string, revokedAt: Date): Promise<number>;
  listByUser(userId: string): Promise<SessionRecord[]>;
}

/** Password-reset tickets keyed by token hash. */
export interface PasswordResetStore {
  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}

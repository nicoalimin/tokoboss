import type {
  NewWorkspaceInviteInput,
  WorkspaceInviteRecord,
} from './invite-types';

/**
 * Persistence port for `workspace_invites`. Implementations:
 * - `DrizzleInviteStore` (`@tokoboss/database`) — Postgres/Neon.
 * - `InMemoryInviteStore` (here) — unit tests.
 *
 * Every read except `findByTokenHash` is workspace-scoped.
 * `findByTokenHash` is the ONLY cross-workspace lookup and backs the
 * token-gated accept route — the ticket hash is the authority, never a
 * client-supplied workspace id.
 */
export interface WorkspaceInviteStore {
  create(input: NewWorkspaceInviteInput): Promise<WorkspaceInviteRecord>;
  findByTokenHash(tokenHash: string): Promise<WorkspaceInviteRecord | null>;
  findById(
    id: string,
    workspaceId: string
  ): Promise<WorkspaceInviteRecord | null>;
  listByWorkspace(workspaceId: string): Promise<WorkspaceInviteRecord[]>;
  /** Pending non-expired ticket for this workspace+email, if any. */
  findPendingByWorkspaceAndEmail(
    workspaceId: string,
    normalizedEmail: string,
    now: Date
  ): Promise<WorkspaceInviteRecord | null>;
  update(
    id: string,
    workspaceId: string,
    patch: {
      status?: WorkspaceInviteRecord['status'];
      acceptedAt?: Date | null;
    }
  ): Promise<WorkspaceInviteRecord>;
}

/**
 * Narrow credential port for invite accept (optional user provisioning).
 * `@tokoboss/application`'s auth `CredentialStore` satisfies it
 * structurally; tenancy never imports the auth module (no cycle) — same
 * pattern as `SessionRevoker`.
 */
export interface InviteCredentialStore {
  findByEmail(normalizedEmail: string): Promise<{
    userId: string;
  } | null>;
  create(input: {
    email: string;
    userId: string;
    passwordHash: string;
  }): Promise<{ userId: string }>;
}

/** Narrow password-hashing port for invite-accept provisioning. */
export interface InvitePasswordHasher {
  hash(plaintext: string): Promise<string>;
}

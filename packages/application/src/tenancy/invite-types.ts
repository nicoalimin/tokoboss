import type { WorkspaceRole } from './tenancy-types';

/**
 * Workspace invite vocabulary (UTA-70).
 *
 * An invite is a single-use ticket binding an **email** (normalized at the
 * use-case boundary) to a workspace + role (+ optional warehouse scope).
 * The opaque bearer token is returned once at creation; only its sha256
 * (`tokenHash`) is stored — mirroring `auth_password_resets` (UTA-67).
 *
 * The `email` is PII: it lives in the invite row so `accept` can bind the
 * ticket to the credential row, but it must NEVER be copied into audit
 * payloads or logs (`assertTenancyPayloadSafe` rejects it at the boundary).
 */

export const WORKSPACE_INVITE_STATUSES = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const;
export type WorkspaceInviteStatus = (typeof WORKSPACE_INVITE_STATUSES)[number];

export function isWorkspaceInviteStatus(
  value: unknown
): value is WorkspaceInviteStatus {
  return (
    typeof value === 'string' &&
    (WORKSPACE_INVITE_STATUSES as readonly string[]).includes(value)
  );
}

/** Stored invite row (server-side only — never returned to clients whole). */
export interface WorkspaceInviteRecord {
  id: string;
  workspaceId: string;
  /** Normalized invitee email (PII — never logged, never audited). */
  email: string;
  role: WorkspaceRole;
  /** Opaque warehouse id or null (all warehouses). */
  warehouseScope: string | null;
  /** Hex sha256 of the opaque invite token. Never logged. */
  tokenHash: string;
  status: WorkspaceInviteStatus;
  expiresAt: Date;
  /** Opaque inviter user id. Never email. */
  invitedBy: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewWorkspaceInviteInput {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  warehouseScope?: string | null;
  tokenHash: string;
  expiresAt: Date;
  invitedBy?: string | null;
}

/**
 * Client-safe invite projection (no token hash, no raw token). `email` is
 * included ONLY in authenticated Admin responses (the Admin supplied it);
 * audit payloads and logs must use `InviteAuditRef` instead.
 */
export interface WorkspaceInviteView {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  warehouseScope: string | null;
  status: WorkspaceInviteStatus;
  expiresAt: string;
  invitedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export function toInviteView(r: WorkspaceInviteRecord): WorkspaceInviteView {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    email: r.email,
    role: r.role,
    warehouseScope: r.warehouseScope,
    status: r.status,
    expiresAt: r.expiresAt.toISOString(),
    invitedBy: r.invitedBy,
    acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Default invite lifetime (7 days). Overridable per invite (1–30 days). */
export const INVITE_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const INVITE_EVENT_ACTIONS = [
  'invite.created',
  'invite.accepted',
  'invite.revoked',
  'invite.expired',
] as const;
export type InviteEventAction = (typeof INVITE_EVENT_ACTIONS)[number];

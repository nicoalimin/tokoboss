import { TenancyValidationError } from './tenancy-errors';
import {
  isWorkspaceMemberStatus,
  isWorkspaceRole,
  type WorkspaceMemberStatus,
  type WorkspaceRole,
} from './tenancy-types';

/**
 * Safety guard for tenancy + audit payloads (UTA-19 acceptance: "no
 * secrets/PII in logs or client bundles").
 *
 * Mirrors the logging-side rules in `@tokoboss/observability` (`redact.ts`)
 * but lives here so the application layer keeps its "imports only domain"
 * boundary. Rejects:
 * - sensitive keys (password/secret/token/session/...)
 * - PII keys (email/phone/nik/address/customer/...)
 * - raw-payload / blob keys (marketplace payloads, presigned urls)
 * - value patterns (email, bearer token, postgres url, ID phone, 16-digit NIK)
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const BEARER_RE =
  /\b(Bearer\s+[A-Za-z0-9\-._~+/=]{8,}|sk-[A-Za-z0-9\-_]{8,}|xox[bap]-[A-Za-z0-9\-_]{8,})\b/;
const POSTGRES_RE = /postgres(?:ql)?:\/\/\S+/;
const PHONE_RE = /(?:(?:\+62|62|0)8\d{2}[\s-]?\d{3,4}[\s-]?\d{3,5})/;
const NIK_RE = /\b\d{16}\b/;

const VALUE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'email address', re: EMAIL_RE },
  { name: 'bearer/api token', re: BEARER_RE },
  { name: 'postgres connection string', re: POSTGRES_RE },
  { name: 'phone number', re: PHONE_RE },
  { name: '16-digit identity number', re: NIK_RE },
];

const SENSITIVE_KEY =
  /password|passwd|secret|token|api[_-]?key|auth|authorization|cookie|session|private[_-]?key|signing|webhook[_-]?secret|database[_-]?url|connection[_-]?string/i;
const PII_KEY =
  /^(email|e-mail|phone|phone_number|msisdn|nik|ktp|address|full[_-]?name|customer[_-]?name|buyer[_-]?name|recipient)$|customer|buyer_email|buyer_phone/i;
const RAW_PAYLOAD_KEY =
  /raw[_-]?payload|marketplace[_-]?payload|webhook[_-]?body|payload_raw/i;
const BLOB_KEY = /blob|presigned|signed[_-]?url|private[_-]?(path|url|blob)/i;

/**
 * Opaque tenancy identifiers that legitimately contain `auth`/`user`/`token`
 * substrings (`authVersion`, `userId`, ...) yet carry no secrets. Checked
 * before the sensitive/PII key rules so version bumps stay auditable.
 */
const SAFE_TENANCY_KEY = new Set([
  'workspaceId',
  'workspace_id',
  'userId',
  'user_id',
  'authVersion',
  'auth_version',
  'warehouseScope',
  'warehouse_scope',
  'role',
  'status',
  'from',
  'to',
  'name',
  'slug',
  'reason',
  'action',
  'category',
  'actorId',
  'actorType',
  'correlationId',
  'inviteId',
  'invite_id',
  'invitedBy',
  'invited_by',
  'expiresAt',
  'expires_at',
  'acceptedAt',
  'accepted_at',
]);

function scanValue(path: string, value: unknown): void {
  if (typeof value === 'string') {
    for (const { name, re } of VALUE_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(value)) {
        throw new TenancyValidationError(`${path} contains ${name}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanValue(`${path}[${i}]`, v));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const child = path ? `${path}.${k}` : k;
      if (!SAFE_TENANCY_KEY.has(k)) {
        if (
          SENSITIVE_KEY.test(k) ||
          PII_KEY.test(k) ||
          RAW_PAYLOAD_KEY.test(k) ||
          BLOB_KEY.test(k)
        ) {
          throw new TenancyValidationError(`${child} uses forbidden key`);
        }
      }
      scanValue(child, v);
    }
  }
}

/** Throw `TenancyValidationError` when an audit payload leaks secrets/PII. */
export function assertTenancyPayloadSafe(
  payload: unknown,
  label = 'payload'
): void {
  if (payload === null || payload === undefined) return;
  if (typeof payload !== 'object') {
    scanValue(label, payload);
    return;
  }
  scanValue(label, payload);
}

export function requireWorkspaceId(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new TenancyValidationError('workspaceId must not be empty');
  }
  return value.trim();
}

export function requireUserId(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new TenancyValidationError('userId must not be empty');
  }
  const id = value.trim();
  // Opaque ids only — never accept raw emails as user identity.
  if (EMAIL_RE.test(id)) {
    throw new TenancyValidationError('userId must be opaque (never an email)');
  }
  return id;
}

export function requireRole(value: unknown): WorkspaceRole {
  if (!isWorkspaceRole(value)) {
    throw new TenancyValidationError(
      `role must be one of admin|manager|staff (got ${JSON.stringify(value)})`
    );
  }
  return value;
}

export function requireStatus(value: unknown): WorkspaceMemberStatus {
  if (!isWorkspaceMemberStatus(value)) {
    throw new TenancyValidationError(
      `status must be one of active|deactivated (got ${JSON.stringify(value)})`
    );
  }
  return value;
}

/**
 * Warehouse scope rules (UTA-17 freeze):
 * - Admin: must be null (unscoped, sees all warehouses).
 * - Manager/Staff: null (all) or a non-empty opaque warehouse id.
 */
export function requireWarehouseScope(
  role: WorkspaceRole,
  scope: string | null | undefined
): string | null {
  if (scope === undefined || scope === null) return null;
  const trimmed = scope.trim();
  if (role === 'admin') {
    if (trimmed.length > 0) {
      throw new TenancyValidationError(
        'Admin must not carry a warehouse scope'
      );
    }
    return null;
  }
  if (trimmed.length === 0) return null;
  if (EMAIL_RE.test(trimmed)) {
    throw new TenancyValidationError(
      'warehouseScope must be opaque (never an email)'
    );
  }
  return trimmed;
}

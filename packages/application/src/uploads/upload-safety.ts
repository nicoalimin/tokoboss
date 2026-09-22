import { UploadValidationError } from './upload-ports';
import {
  MAX_FILENAME_LEN,
  PURPOSE_MAX_BYTES,
  PURPOSE_MIME_ALLOWLIST,
  isFileUploadPurpose,
} from './upload-types';

/**
 * Safety guard for upload metadata (UTA-15 acceptance: "Blob contents are
 * not stored in Postgres, and secrets never reach client bundles/logs").
 *
 * - Rejects payload keys that would carry raw bytes, secrets, or PII.
 * - `assertUploadMetadataSafe` runs at every use-case boundary that accepts
 *   caller-supplied JSON (token request, completion callback).
 */

const SENSITIVE_KEY =
  /password|passwd|secret|token|api[_-]?key|auth|authorization|cookie|session|private[_-]?key|signing|webhook[_-]?secret|database[_-]?url|connection[_-]?string|upload[_-]?token|download[_-]?url|presigned/i;
const PII_KEY =
  /^(email|e-mail|phone|phone_number|msisdn|nik|ktp|address|full[_-]?name|customer[_-]?name|buyer[_-]?name|recipient)$|customer|buyer_email|buyer_phone/i;
const BYTES_KEY =
  /content|bytes|data|base64|buffer|blob[_-]?content|file[_-]?content|raw/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const BEARER_RE =
  /\b(Bearer\s+[A-Za-z0-9\-._~+/=]{8,}|sk-[A-Za-z0-9\-_]{8,}|xox[bap]-[A-Za-z0-9\-_]{8,}|vercel_blob_rw_[A-Za-z0-9\-_]{4,})\b/;
const POSTGRES_RE = /postgres(?:ql)?:\/\/\S+/;

function scanValue(path: string, value: unknown): void {
  if (typeof value === 'string') {
    if (EMAIL_RE.test(value)) {
      throw new UploadValidationError(`${path} contains email address`);
    }
    BEARER_RE.lastIndex = 0;
    if (BEARER_RE.test(value)) {
      throw new UploadValidationError(`${path} contains bearer/api token`);
    }
    if (POSTGRES_RE.test(value)) {
      throw new UploadValidationError(
        `${path} contains postgres connection string`
      );
    }
    // Blob contents (base64/data-URL) must never be stored as metadata.
    if (value.startsWith('data:') || /^[A-Za-z0-9+/=]{1024,}$/.test(value)) {
      throw new UploadValidationError(
        `${path} looks like file contents — store a pathname reference, not bytes`
      );
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
      if (SENSITIVE_KEY.test(k) || PII_KEY.test(k) || BYTES_KEY.test(k)) {
        throw new UploadValidationError(`${child} uses forbidden key`);
      }
      scanValue(child, v);
    }
  }
}

export function assertUploadMetadataSafe(
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

export interface TokenRequestValidation {
  workspaceId: string;
  purpose: string;
  filename: string;
  contentType: string;
  byteSize: number;
  role: string;
}

/**
 * Validate role, workspace, purpose, filename/type, size BEFORE issuing any
 * short-lived client-upload token. Throws `UploadValidationError` on the
 * first violation — the caller must not issue a token afterwards.
 */
export function validateTokenRequest(input: TokenRequestValidation): void {
  if (!input.workspaceId || input.workspaceId.trim().length === 0) {
    throw new UploadValidationError('workspaceId must not be empty');
  }
  if (!isFileUploadPurpose(input.purpose)) {
    throw new UploadValidationError(
      `purpose must be one of the operational purposes (got ${JSON.stringify(input.purpose)})`
    );
  }
  if (!input.role || input.role.trim().length === 0) {
    throw new UploadValidationError('role must not be empty');
  }
  const allowed = PURPOSE_MIME_ALLOWLIST[input.purpose];
  if (!allowed.includes(input.contentType)) {
    throw new UploadValidationError(
      `contentType ${JSON.stringify(input.contentType)} not allowed for purpose ${JSON.stringify(input.purpose)}`
    );
  }
  const maxBytes = PURPOSE_MAX_BYTES[input.purpose];
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    throw new UploadValidationError('byteSize must be a positive number');
  }
  if (input.byteSize > maxBytes) {
    throw new UploadValidationError(
      `byteSize ${input.byteSize} exceeds ${maxBytes} for purpose ${JSON.stringify(input.purpose)}`
    );
  }
  if (typeof input.filename !== 'string') {
    throw new UploadValidationError('filename must be a string');
  }
  const filename = input.filename.trim();
  if (filename.length === 0) {
    throw new UploadValidationError('filename must not be empty');
  }
  if (filename.length > MAX_FILENAME_LEN) {
    throw new UploadValidationError(
      `filename exceeds ${MAX_FILENAME_LEN} chars`
    );
  }
  if (
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    throw new UploadValidationError('filename must be a bare name (no paths)');
  }
}

/** Strip client-supplied path components; server owns the full pathname. */
export function sanitizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, MAX_FILENAME_LEN);
}

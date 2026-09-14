/**
 * Redaction (UTA-12).
 *
 * Secrets, tokens, raw marketplace payloads, customer PII, and private Blob
 * paths must never reach logs. Every logger call passes through `redact()`.
 *
 * Rules:
 * - Key-based: sensitive / PII / raw-payload / blob keys -> `[REDACTED]`
 *   (blob paths -> `[REDACTED_BLOB_PATH]` so dashboards can still count them).
 * - Value-based: emails, Bearer tokens, postgres URLs (keep host only),
 *   Indonesian phone numbers, 16-digit NIK, long hex secrets.
 * - Depth-capped and circular-safe.
 */

export const REDACTED = '[REDACTED]';
export const REDACTED_BLOB_PATH = '[REDACTED_BLOB_PATH]';

const SENSITIVE_KEY =
  /password|passwd|secret|token|api[_-]?key|auth|authorization|cookie|set-cookie|session|private[_-]?key|signing|webhook[_-]?secret|database[_-]?url|pool[_-]?url|connection[_-]?string/i;

const PII_KEY =
  /^(email|e-mail|phone|phone_number|msisdn|nik|ktp|address|full[_-]?name|customer[_-]?name|buyer[_-]?name|recipient)$|customer|buyer_email|buyer_phone/i;

const RAW_PAYLOAD_KEY =
  /raw[_-]?payload|marketplace[_-]?payload|webhook[_-]?body|shopee[_-]?payload|tokopedia[_-]?payload|payload_raw/i;

const BLOB_KEY = /blob|presigned|signed[_-]?url|private[_-]?(path|url|blob)/i;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER_RE =
  /\b(Bearer\s+[A-Za-z0-9\-._~+/=]{8,}|sk-[A-Za-z0-9\-_]{8,}|xox[bap]-[A-Za-z0-9\-_]{8,})\b/g;
const POSTGRES_RE = /postgres(?:ql)?:\/\/[^\s"'`]+/g;
const PHONE_RE = /(?:(?:\+62|62|0)8\d{2}[\s-]?\d{3,4}[\s-]?\d{3,5})/g;
const NIK_RE = /\b\d{16}\b/g;
const LONG_HEX_RE = /\b(?:[0-9a-f]{32,}|[A-Za-z0-9\-_]{32,})\b/g;

function redactDatabaseUrlToHost(value: string): string {
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}/[REDACTED]`;
  } catch {
    return 'postgres://[REDACTED]/[REDACTED]';
  }
}

function redactStringByValue(key: string, value: string): string {
  // `replace` with a global regex always scans from index 0, so no
  // lastIndex bookkeeping is needed here.
  const out = value
    .replace(POSTGRES_RE, (m) => redactDatabaseUrlToHost(m))
    .replace(EMAIL_RE, REDACTED)
    .replace(BEARER_RE, REDACTED)
    .replace(PHONE_RE, REDACTED)
    .replace(NIK_RE, REDACTED);
  // Only scrub long opaque secrets when the key already looks sensitive or
  // blob-like; otherwise long hex (e.g. a commit SHA) is useful diagnostics.
  const scrubbed =
    SENSITIVE_KEY.test(key) || BLOB_KEY.test(key)
      ? out.replace(LONG_HEX_RE, REDACTED)
      : out;
  return scrubbed;
}

function redactKeyValue(
  key: string,
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (SENSITIVE_KEY.test(key) || RAW_PAYLOAD_KEY.test(key)) return REDACTED;
  if (PII_KEY.test(key)) return REDACTED;
  if (BLOB_KEY.test(key)) {
    if (typeof value === 'string') {
      // Preserve scheme/host shape for diagnostics without the private path.
      try {
        const u = new URL(value);
        return `${u.protocol}//${u.host}/${REDACTED_BLOB_PATH}`;
      } catch {
        return REDACTED_BLOB_PATH;
      }
    }
    return REDACTED_BLOB_PATH;
  }
  return redactUnknown(value, depth, seen);
}

function redactUnknown(
  value: unknown,
  depth: number,
  seen: WeakSet<object>
): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactStringByValue('', value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    if (seen.has(value)) return REDACTED;
    seen.add(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactUnknown(v, depth + 1, seen));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        typeof v === 'string' &&
        !SENSITIVE_KEY.test(k) &&
        !PII_KEY.test(k) &&
        !RAW_PAYLOAD_KEY.test(k) &&
        !BLOB_KEY.test(k)
      ) {
        out[k] = redactStringByValue(k, v);
      } else {
        out[k] = redactKeyValue(k, v, depth + 1, seen);
      }
    }
    return out;
  }
  return value;
}

/**
 * Redact any value for safe logging. Circular-safe: cycles collapse to
 * `[REDACTED]` instead of recursing forever.
 */
export function redact<T>(value: T): T {
  try {
    return redactUnknown(value, 0, new WeakSet()) as T;
  } catch {
    return REDACTED as unknown as T;
  }
}

/** Redact a flat record of log fields. */
export function redactFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  return redact(fields);
}

/**
 * Assert a payload contains no obvious secret/PII leak. Throws if
 * `JSON.stringify(payload)` still matches a sensitive value pattern or
 * contains a known secret. Backs the CI `health` job's secret scan.
 */
export function assertNoSecrets(
  payload: unknown,
  secrets: string[] = []
): void {
  const text = JSON.stringify(payload ?? {});
  const patterns: RegExp[] = [
    EMAIL_RE,
    BEARER_RE,
    POSTGRES_RE,
    PHONE_RE,
    NIK_RE,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    if (re.test(text)) {
      throw new Error(
        `assertNoSecrets: payload matches sensitive pattern ${re}`
      );
    }
  }
  for (const s of secrets) {
    if (s && text.includes(s)) {
      throw new Error('assertNoSecrets: payload contains a known secret value');
    }
  }
}

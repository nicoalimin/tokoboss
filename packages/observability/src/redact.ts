// Redaction (UTA-12).
//
// The logger redacts these categories automatically:
// - secrets / tokens (env-style keys, bearer tokens, api keys)
// - raw marketplace payloads (vendor payload blobs are never logged verbatim)
// - customer PII (emails, phone numbers, Indonesian NIK)
// - private Blob paths (signed / private URLs and `private/...` storage keys)
//
// Everything redacted becomes the literal string `[REDACTED]` so tests and
// log pipelines can assert on it. Depth + cycle safe.

export const REDACTED = '[REDACTED]';

// Correlation / envelope keys whose values are safe generated IDs — never
// redact their contents (redacting `req_...` ids would break correlation).
const SAFE_ID_KEYS = new Set([
  'requestid',
  'workspaceid',
  'jobid',
  'workflowrunid',
  'integrationcorrelationid',
  'deploymentid',
  'errorcode',
  'event',
  'service',
  'level',
  'timestamp',
]);

const SECRET_KEY_PATTERN =
  /(secret|token|password|passwd|pwd|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|auth|authorization|bearer|session|cookie|signature|signing|webhook[-_]?secret|database[-_]?url|connection[-_]?string)/i;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Loose international phone matcher; applied to string values that look like
// a phone number (digits, spaces, dashes, leading +), min 8 digits.
const PHONE_PATTERN = /\+?\d[\d\s\-().]{6,}\d/g;
// Indonesian NIK: exactly 16 digits.
const NIK_PATTERN = /(?<!\d)\d{16}(?!\d)/g;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9\-._~+/=]+/gi;
const MARKETPLACE_PAYLOAD_KEY_PATTERN =
  /(marketplace|shopee|tokopedia|bukalapak|lazada|blibli|tiktok|vendor)[-_ ]?(payload|raw|response|body|webhook)/i;
const PRIVATE_BLOB_PATTERN =
  /((private|secret)\/[\w\-./]+|(https?:\/\/\S*?(blob|storage)[\w\-./?=&%]*?(sig(nature)?|token|key)=[\w\-./?=&%]+))/i;

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 16) return false;
  // Require a phone separator (+, space, dash, paren, dot) so pure digit/hex
  // runs such as `req_2bf76009189f` correlation ids are never treated as phones.
  // Exactly-16-digit NIKs are handled separately by NIK_PATTERN.
  if (!/[+\s\-.()]/.test(value)) return false;
  return /^\+?[\d\s\-.()]+$/.test(value.trim());
}

function redactStringValue(key: string | undefined, value: string): string {
  if (key && SAFE_ID_KEYS.has(key.toLowerCase())) return value;
  if (key && SECRET_KEY_PATTERN.test(key)) return REDACTED;
  if (key && MARKETPLACE_PAYLOAD_KEY_PATTERN.test(key)) return REDACTED;
  let out = value;
  if (BEARER_PATTERN.test(out)) return REDACTED;
  BEARER_PATTERN.lastIndex = 0;
  out = out.replace(EMAIL_PATTERN, REDACTED);
  if (looksLikePhone(out.trim())) return REDACTED;
  out = out.replace(PHONE_PATTERN, (m) => (looksLikePhone(m) ? REDACTED : m));
  out = out.replace(NIK_PATTERN, REDACTED);
  if (PRIVATE_BLOB_PATTERN.test(out)) return REDACTED;
  if (key && /blob|storage|signed[-_]?url/i.test(key)) {
    if (/https?:\/\//.test(out) || /private\//.test(out)) return REDACTED;
  }
  return out;
}

/** Redact a single value. Objects/arrays are deep-cloned with redaction applied. */
export function redactValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactStringValue(key, value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    if (key && SECRET_KEY_PATTERN.test(key)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, key));
  }
  if (typeof value === 'object') {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

const MAX_REDACT_DEPTH = 20;

/** Deep-clone + redact a log payload. Cycle-safe (cycles become `[REDACTED]`). */
export function redactObject(
  input: Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0
): Record<string, unknown> {
  if (seen.has(input)) return REDACTED as unknown as Record<string, unknown>;
  if (depth > MAX_REDACT_DEPTH)
    return REDACTED as unknown as Record<string, unknown>;
  seen.add(input);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SECRET_KEY_PATTERN.test(k) || MARKETPLACE_PAYLOAD_KEY_PATTERN.test(k)) {
      out[k] = REDACTED;
      continue;
    }
    if (v !== null && typeof v === 'object') {
      if (seen.has(v as object)) {
        out[k] = REDACTED;
        continue;
      }
      out[k] =
        Array.isArray(v) && depth + 1 <= MAX_REDACT_DEPTH
          ? (v as unknown[]).map((item) =>
              item !== null && typeof item === 'object'
                ? redactObject(item as Record<string, unknown>, seen, depth + 1)
                : redactValue(item, k)
            )
          : redactValue(v, k);
      continue;
    }
    out[k] = redactValue(v, k);
  }
  seen.delete(input);
  return out;
}

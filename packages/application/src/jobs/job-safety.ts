import { JobUnsafePayloadError } from './job-ports';

/**
 * Safety guard for job refs and event payloads (UTA-14 acceptance:
 * "Job payload/log tests reject unnecessary secrets or raw PII").
 *
 * `input_ref` / `output_ref` / event payloads must carry references and
 * progress metadata only — never secrets, tokens, raw payloads, customer
 * PII, or private blob paths. This mirrors the logging-side rules in
 * `@tokoboss/observability` (`redact.ts`) but lives here so the application
 * layer keeps its "imports only domain" boundary (no observability import).
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

function scanValue(path: string, value: unknown): void {
  if (typeof value === 'string') {
    for (const { name, re } of VALUE_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(value)) {
        throw new JobUnsafePayloadError(`${path} contains ${name}`);
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
      if (
        SENSITIVE_KEY.test(k) ||
        PII_KEY.test(k) ||
        RAW_PAYLOAD_KEY.test(k) ||
        BLOB_KEY.test(k)
      ) {
        throw new JobUnsafePayloadError(`${child} uses forbidden key`);
      }
      scanValue(child, v);
    }
  }
}

/**
 * Throw `JobUnsafePayloadError` when a job ref/event payload carries
 * secrets or raw PII. Called at every use-case boundary that accepts
 * caller-supplied JSON (create input_ref, complete output_ref, event
 * payloads) and at the hello Workflow's step boundaries.
 */
export function assertJobPayloadSafe(
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

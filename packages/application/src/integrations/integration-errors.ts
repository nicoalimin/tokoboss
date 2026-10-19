/**
 * Marketplace integration error codes + HTTP mapping (US20 / RFC 04 task 17).
 * Messages are client-safe: no secrets and nothing about another workspace.
 */

export type IntegrationErrorCode =
  | 'INTEGRATION_VALIDATION'
  | 'ROLE_FORBIDDEN'
  | 'CONNECTION_NOT_FOUND'
  | 'PROVIDER_NOT_AVAILABLE'
  | 'STORE_CONNECTED_ELSEWHERE'
  | 'ALREADY_CONNECTED'
  | 'REAUTH_STORE_MISMATCH'
  | 'STATE_INVALID'
  | 'CONNECT_FAILED'
  | 'PROVIDER_UNAVAILABLE';

export type ConnectFailedReason =
  | 'cancelled'
  | 'unsupported_account'
  | 'provider_unavailable'
  | 'state_invalid';

export const INTEGRATION_ERROR_HTTP_STATUS: Record<
  IntegrationErrorCode,
  number
> = {
  INTEGRATION_VALIDATION: 400,
  ROLE_FORBIDDEN: 403,
  CONNECTION_NOT_FOUND: 404,
  PROVIDER_NOT_AVAILABLE: 404,
  STORE_CONNECTED_ELSEWHERE: 409,
  ALREADY_CONNECTED: 409,
  REAUTH_STORE_MISMATCH: 409,
  STATE_INVALID: 410,
  CONNECT_FAILED: 422,
  PROVIDER_UNAVAILABLE: 503,
};

export type IntegrationError = Error & {
  code: IntegrationErrorCode;
  details?: { reason: ConnectFailedReason };
};

function intErr(
  message: string,
  code: IntegrationErrorCode,
  reason?: ConnectFailedReason
): IntegrationError {
  const err = new Error(message) as IntegrationError;
  err.code = code;
  if (reason !== undefined) err.details = { reason };
  return err;
}

/** HTTP status for an integration error code; anything else → 500. */
export function integrationErrorStatus(err: unknown): number {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code in INTEGRATION_ERROR_HTTP_STATUS
    ? INTEGRATION_ERROR_HTTP_STATUS[code as IntegrationErrorCode]
    : 500;
}

export const integrationValidation = (message: string) =>
  intErr(message, 'INTEGRATION_VALIDATION');

export const integrationRoleForbidden = () =>
  intErr('Hanya Admin yang dapat melakukan tindakan ini.', 'ROLE_FORBIDDEN');

/** Unknown, removed or cross-workspace connection id → 404 (no enumeration). */
export const connectionNotFound = () =>
  intErr('Koneksi tidak ditemukan.', 'CONNECTION_NOT_FOUND');

/** Provider disabled by env, or unknown provider slug → 404. */
export const providerNotAvailable = () =>
  intErr('Marketplace tidak tersedia.', 'PROVIDER_NOT_AVAILABLE');

/** Store owned by another workspace → neutral 409, never names the owner. */
export const storeConnectedElsewhere = () =>
  intErr(
    'Toko ini sudah terhubung ke workspace lain.',
    'STORE_CONNECTED_ELSEWHERE'
  );

export const alreadyConnected = () =>
  intErr('Toko ini sudah terhubung.', 'ALREADY_CONNECTED');

/** Reauthorization returned a different provider store → 409, no change. */
export const reauthStoreMismatch = () =>
  intErr(
    'Otorisasi ulang harus memakai toko yang sama.',
    'REAUTH_STORE_MISMATCH'
  );

/** OAuth state missing, expired, consumed or from another session → 410. */
export const stateInvalid = () =>
  intErr('Sesi koneksi kedaluwarsa. Coba lagi.', 'STATE_INVALID');

/** Cancelled, unsupported account/region → 422 (no row, no claim). */
export const connectFailed = (reason: ConnectFailedReason) =>
  intErr('Koneksi gagal. Coba lagi.', 'CONNECT_FAILED', reason);

/** Provider maintenance or rate limit → 503 (retried, not marked success). */
export const providerUnavailable = () =>
  intErr('Marketplace sedang tidak tersedia.', 'PROVIDER_UNAVAILABLE');

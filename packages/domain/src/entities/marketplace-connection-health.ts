import type { MarketplaceConnectionStatus } from './marketplace-connection';

/**
 * Marketplace connection health badge + token diagnostics (UTA-38 / US18,
 * RFC 07 row 1a). Pure and cron-free: evaluated at read/intake time. The
 * RFC 04 14-day MARKETPLACE_REAUTH_WINDOW_MS rule stays untouched (D1).
 */
export const CONNECTION_HEALTH_STATUSES = [
  'healthy',
  'paused_partial',
  'paused_full',
  'expiring_soon',
  'degraded',
  'needs_reauth',
  'disconnected',
] as const;
export type ConnectionHealthStatus =
  (typeof CONNECTION_HEALTH_STATUSES)[number];

export type ConnectionHealthTone = 'ok' | 'sky' | 'warn' | 'bad';

/** PRD 18 badge copy and tone per health status. */
export const CONNECTION_HEALTH_BADGES: Readonly<
  Record<ConnectionHealthStatus, { label: string; tone: ConnectionHealthTone }>
> = {
  healthy: { label: 'Sehat · Aktif', tone: 'ok' },
  paused_partial: { label: 'Dijeda sebagian', tone: 'sky' },
  paused_full: { label: 'Dijeda penuh', tone: 'sky' },
  expiring_soon: { label: 'Token hampir kedaluwarsa', tone: 'warn' },
  degraded: { label: 'Gangguan kanal / Rate-limited', tone: 'warn' },
  needs_reauth: { label: 'Perlu otorisasi ulang', tone: 'bad' },
  disconnected: { label: 'Terputus', tone: 'bad' },
};

const DAY_MS = 86_400_000;

/** Refresh token within 5 days of expiry → Token hampir kedaluwarsa. */
export const CONNECTION_HEALTH_WARNING_MS = 5 * DAY_MS;

/** Transient provider errors that mark a connected store as degraded. */
export const CONNECTION_DEGRADED_ERROR_CODES: readonly string[] = [
  'MARKETPLACE_RATE_LIMITED',
  'MARKETPLACE_UNAVAILABLE',
];

export interface ConnectionHealthInput {
  readonly status: MarketplaceConnectionStatus;
  readonly orderImportEnabled: boolean;
  readonly inventorySyncEnabled: boolean;
  readonly missingPermissions: readonly string[];
  /** ~30-day refresh-token horizon; null = no known expiry. */
  readonly authExpiresAt: Date | null;
  readonly lastErrorCode?: string | null;
  readonly rateLimitedSkuCount?: number;
}

/**
 * Precedence: disconnected → needs_reauth → degraded → expiring_soon →
 * paused_full → paused_partial → healthy.
 */
export function evaluateConnectionHealth(
  input: ConnectionHealthInput,
  now: Date
): ConnectionHealthStatus {
  if (input.status === 'disconnected') return 'disconnected';
  const msLeft =
    input.authExpiresAt === null
      ? null
      : input.authExpiresAt.getTime() - now.getTime();
  if (input.status === 'needs_reauth' || (msLeft !== null && msLeft <= 0)) {
    return 'needs_reauth';
  }
  if (
    input.missingPermissions.length > 0 ||
    (input.rateLimitedSkuCount ?? 0) > 0 ||
    CONNECTION_DEGRADED_ERROR_CODES.includes(input.lastErrorCode ?? '')
  ) {
    return 'degraded';
  }
  if (msLeft !== null && msLeft <= CONNECTION_HEALTH_WARNING_MS) {
    return 'expiring_soon';
  }
  if (!input.orderImportEnabled && !input.inventorySyncEnabled) {
    return 'paused_full';
  }
  if (!input.orderImportEnabled || !input.inventorySyncEnabled) {
    return 'paused_partial';
  }
  return 'healthy';
}

/** Token pill copy: `Token 3 hari lagi`, `Token kedaluwarsa`, or null. */
export function formatTokenExpiryWindowDays(
  authExpiresAt: Date | null,
  now: Date
): string | null {
  if (authExpiresAt === null) return null;
  const days = Math.ceil((authExpiresAt.getTime() - now.getTime()) / DAY_MS);
  return days <= 0 ? 'Token kedaluwarsa' : `Token ${days} hari lagi`;
}

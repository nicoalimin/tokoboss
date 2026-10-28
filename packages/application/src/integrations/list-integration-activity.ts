import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { connectionNotFound } from './integration-errors';
import { assertIntegrationStatusRead } from './integration-guards';
import {
  INTEGRATION_ACTIVITY_DEFAULT_LIMIT,
  INTEGRATION_ACTIVITY_MAX_LIMIT,
  type IntegrationActivityAction,
  type IntegrationActivityEntry,
  type IntegrationActivityReadsPort,
} from './integration-management-ports';
import type * as ports from './integration-ports';

/**
 * Log Aktivitas & Audit Integrasi read (UTA-38 / US18, RFC 07 row 13).
 * Every active member (Admin, Manager, Staff); other workspace / inactive
 * → tenancy forbidden. With `connectionId`, an unknown or removed store →
 * 404 CONNECTION_NOT_FOUND. Newest first, limit clamped to 1..50 (default
 * 20). Adds a Bahasa Indonesia operational-impact `summary`; WIB is web-side.
 */

export interface ListIntegrationActivityDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  activity: IntegrationActivityReadsPort;
}

export interface ListIntegrationActivityInput {
  workspaceId: string;
  /** Omit for the workspace-wide feed. */
  connectionId?: string;
  limit?: number;
}

export interface IntegrationActivityItem extends IntegrationActivityEntry {
  /** Operational impact, e.g. `Impor order dijeda · Sinkron stok aktif`. */
  summary: string;
}

export interface IntegrationActivityList {
  items: IntegrationActivityItem[];
}

const SUMMARY: Record<IntegrationActivityAction, string> = {
  'integration.connected': 'Toko terhubung; impor order & sinkron stok aktif.',
  'integration.reauthorized': 'Otorisasi ulang berhasil; token diperbarui.',
  'integration.controls_updated': 'Pengaturan kemampuan toko diubah.',
  'integration.token_refresh_failed': 'Refresh token gagal; otorisasi ulang.',
  'integration.ownership_conflict': 'Toko milik workspace lain; ditolak.',
  'integration.disconnected': 'Toko diputus; impor & sinkron stok berhenti.',
  'integration.removed': 'Toko dihapus; riwayat & pemetaan SKU tetap diarsip.',
  'integration.location_linked': 'Gudang sumber stok ditautkan.',
};

function onOff(value: unknown): string {
  return value === false ? 'dijeda' : 'aktif';
}

/** Bahasa Indonesia operational impact for one audit entry. */
export function summarizeIntegrationActivity(
  entry: IntegrationActivityEntry
): string {
  const current = entry.payload.current as Record<string, unknown> | undefined;
  if (entry.action !== 'integration.controls_updated' || !current) {
    return SUMMARY[entry.action];
  }
  const parts = [
    `Impor order ${onOff(current.orderImportEnabled)}`,
    `Sinkron stok ${onOff(current.inventorySyncEnabled)}`,
  ];
  if (entry.payload.reconciliationQueued === true) {
    parts.push('rekonsiliasi stok diantrikan');
  }
  return parts.join(' · ');
}

function clampLimit(limit: number | undefined): number {
  const whole = Math.trunc(limit ?? INTEGRATION_ACTIVITY_DEFAULT_LIMIT);
  if (!Number.isFinite(whole)) return INTEGRATION_ACTIVITY_DEFAULT_LIMIT;
  return Math.min(INTEGRATION_ACTIVITY_MAX_LIMIT, Math.max(1, whole));
}

export async function listIntegrationActivity(
  deps: ListIntegrationActivityDeps,
  ctx: WorkspaceContext | null,
  input: ListIntegrationActivityInput
): Promise<IntegrationActivityList> {
  assertIntegrationStatusRead(ctx, input.workspaceId);
  const { workspaceId, connectionId } = input;
  if (connectionId !== undefined) {
    const row = await deps.connections.find(workspaceId, connectionId);
    if (!row || row.removedAt) throw connectionNotFound();
  }
  const query = { workspaceId, connectionId, limit: clampLimit(input.limit) };
  const rows = await deps.activity.listByWorkspace(query);
  const items = rows.map((entry) => ({
    ...entry,
    summary: summarizeIntegrationActivity(entry),
  }));
  return { items };
}

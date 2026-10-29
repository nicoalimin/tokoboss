import type {
  IntegrationActivityAction,
  IntegrationActivityItemDto,
} from '@tokoboss/contracts';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';

/**
 * Log Aktivitas & Audit Integrasi (WIB) (UTA-38 / US18, RFC 07 row 32),
 * mockup `#auditTable`: Waktu (WIB), Toko & Kanal, Peristiwa, Pelaku /
 * Sumber and Dampak Operasi (the application `summary`), newest first as
 * served by GET .../activity. Presentational: no fetch, no state.
 */

const EVENT_LABEL: Record<IntegrationActivityAction, string> = {
  'integration.connected': 'Toko dihubungkan',
  'integration.reauthorized': 'Otorisasi ulang berhasil',
  'integration.controls_updated': 'Kontrol kemampuan diubah',
  'integration.token_refresh_failed': 'Refresh token gagal / kedaluwarsa',
  'integration.ownership_conflict': 'Percobaan hubungkan diblokir',
  'integration.disconnected': 'Koneksi toko diputuskan',
  'integration.removed': 'Toko dihapus dari daftar',
  'integration.location_linked': 'Gudang sumber stok ditautkan',
};

const HEADERS = [
  'Waktu (WIB)',
  'Toko & Kanal',
  'Peristiwa',
  'Pelaku / Sumber',
  'Dampak Operasi',
];

export interface IntegrationActivityTableProps {
  items: readonly IntegrationActivityItemDto[];
  /** Optional actor id → display name (e.g. `Nico`); else `Admin`. */
  actorNames?: Readonly<Record<string, string>>;
}

/** Who caused the event: a named Admin, the provider, the guard or system. */
export function activityActorLabel(
  item: IntegrationActivityItemDto,
  actorNames: Readonly<Record<string, string>> = {}
): string {
  if (item.actorId) return `${actorNames[item.actorId] ?? 'Admin'} (Admin)`;
  if (item.action === 'integration.token_refresh_failed')
    return 'Respons API Penyedia';
  if (item.action === 'integration.ownership_conflict')
    return 'Penjaga Kepemilikan (US20)';
  return 'Sistem (On-Request)';
}

export function IntegrationActivityTable({
  items,
  actorNames,
}: Readonly<IntegrationActivityTableProps>) {
  return (
    <section data-testid="integration-activity-table">
      <h2 className="text-base font-semibold text-neutral-900">
        Log Aktivitas &amp; Audit Integrasi (WIB)
      </h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {HEADERS.map((h) => (
              <th key={h} className="text-xs text-neutral-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody id="auditTable">
          {items.map((item) => (
            <tr key={item.id} data-action={item.action}>
              <td>{item.occurredAtWib}</td>
              <td>
                <b>
                  {item.provider
                    ? INTEGRATION_PROVIDER_NAMES[item.provider]
                    : '—'}
                  {item.storeName ? ` · ${item.storeName}` : ''}
                </b>
              </td>
              <td>{EVENT_LABEL[item.action]}</td>
              <td>{activityActorLabel(item, actorNames)}</td>
              <td>{item.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 ? (
        <p className="text-xs text-neutral-600">
          Belum ada aktivitas integrasi.
        </p>
      ) : null}
    </section>
  );
}

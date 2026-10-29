import type { StoreHealthRowView } from '@/lib/integration-management-views';
import {
  IntegrationStoreHealthRow,
  type StoreHealthRowActions,
} from './IntegrationStoreHealthRow';

/**
 * Daftar Toko & Kontrol Kemampuan Independen (UTA-38 / US18, RFC 07 row
 * 31c), mockup Screen 1 `#storeTable`: the seven-column store table with
 * one row 31b `IntegrationStoreHealthRow` per store, or an empty note.
 * Presentational: the parent (row 37) owns fetching and the actions.
 */

export interface IntegrationStoreHealthTableProps extends StoreHealthRowActions {
  rows: readonly StoreHealthRowView[];
  isAdmin: boolean;
}

const HEADERS = [
  'Toko & Identitas Penyedia (US20)',
  'Kesehatan & Masa Berlaku Token',
  'Impor Order',
  'Sinkronisasi Stok (US04)',
  'Pemetaan SKU (US03)',
  'Aktivitas Terakhir (WIB)',
  'Aksi',
];

export function IntegrationStoreHealthTable({
  rows,
  ...rowProps
}: Readonly<IntegrationStoreHealthTableProps>) {
  return (
    <section data-testid="integration-store-health-table">
      <h2 className="text-base font-semibold text-neutral-900">
        Daftar Toko &amp; Kontrol Kemampuan Independen
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
        <tbody id="storeTable">
          {rows.map((row) => (
            <IntegrationStoreHealthRow
              key={row.connection.id}
              row={row}
              {...rowProps}
            />
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-600">
          Belum ada toko yang terhubung ke workspace ini.
        </p>
      ) : null}
    </section>
  );
}

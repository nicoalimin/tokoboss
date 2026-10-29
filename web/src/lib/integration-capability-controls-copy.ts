/**
 * Kontrol Kemampuan copy (UTA-38 / US18, RFC 07 row 34a), mockup Screen 2
 * left card: the two independent capability switches and the business
 * impact note (`#capImpactNote`) for the current switch state. Pure; the
 * row 34b `StoreCapabilityControlsCard` renders it. Never deletes data.
 */
import type { StoreHealthRowView } from './integration-management-views';
import { INTEGRATION_PROVIDER_NAMES } from './integration-copy';

export type CapabilityControlKey =
  'orderImportEnabled' | 'inventorySyncEnabled';

export interface CapabilityControlCopy {
  key: CapabilityControlKey;
  label: string;
  hint: string;
}

export const CAPABILITY_CONTROLS: readonly CapabilityControlCopy[] = [
  {
    key: 'orderImportEnabled',
    label: 'Impor Order Masuk',
    hint: 'Webhook & tarik order on-request ke daftar Order',
  },
  {
    key: 'inventorySyncEnabled',
    label: 'Sinkronisasi Stok Keluar (US04)',
    hint: 'Dorong stok siap jual dari ledger SKU TokoBoss',
  },
];

/** `#capImpactNote` copy for the store's current switch state. */
export function capabilityImpactNote(row: StoreHealthRowView): string {
  const { orderImportEnabled: ord, inventorySyncEnabled: stk } = row.connection;
  const name = INTEGRATION_PROVIDER_NAMES[row.connection.provider];
  if (ord && stk)
    return `✅ Semua kemampuan aktif: TokoBoss memproses order & stok ${name} on-request.`;
  if (!ord && !stk)
    return '⏸️ Semua kemampuan dijeda: tidak ada data baru yang ditarik/didorong hingga dilanjutkan; pemetaan SKU dan histori ledger tetap aman.';
  if (!stk)
    return `⏸️ Dampak saat Sinkronisasi Stok dijeda: perubahan ledger SKU TokoBoss tidak didorong ke ${name}. Ke-${row.metrics.mappedSkuCount} pemetaan Store SKU tetap tersimpan; saat dilanjutkan, Admin dapat memicu rekonsiliasi stok on-request.`;
  return `⏸️ Dampak saat Impor Order dijeda: order baru ${name} tidak ditarik ke daftar Order hingga dilanjutkan; pemetaan SKU dan histori ledger tetap aman.`;
}

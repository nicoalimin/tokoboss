'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CatalogClientError,
  listTransfers,
  listWarehouses,
  type TransferView,
  type TransferStatus,
  type WarehouseView,
} from '@/lib/catalog-client';
import { getMyMembership, TeamClientError } from '@/lib/team-client';

const genericError = 'Daftar transfer tidak dapat dimuat. Silakan coba lagi.';

/** Human-readable labels for transfer status (Bahasa Indonesia). */
const STATUS_LABELS: Record<TransferStatus, string> = {
  draft: 'Draft',
  sent: 'Dikirim',
  received: 'Diterima',
  cancelled: 'Dibatalkan',
};

/** Compact date-time formatter. */
function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('id-ID');
  } catch {
    return isoString;
  }
}

/**
 * Read-only transfer list panel (UTA-137).
 *
 * On mount, fetches the user membership, loads transfers, and optionally
 * loads warehouses for source/dest labels. No create / send / receive /
 * cancel chrome.
 */
export function TransfersPanel() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [transfers, setTransfers] = useState<TransferView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const warehouseMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warehouses) {
      map.set(w.id, `${w.code} — ${w.name}`);
    }
    return map;
  }, [warehouses]);

  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (
        (err instanceof TeamClientError || err instanceof CatalogClientError) &&
        err.needsReauth
      ) {
        router.replace('/sign-in?expired=1');
        return true;
      }
      return false;
    },
    [router]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const membership = await getMyMembership();
      const [transfersList, warehousesList] = await Promise.all([
        listTransfers(membership.workspaceId),
        listWarehouses(membership.workspaceId).catch(() => []),
      ]);
      setTransfers(transfersList);
      setWarehouses(warehousesList);
    } catch (err) {
      if (handleAuthError(err)) return;

      setTransfers([]);
      setWarehouses([]);
      setError(
        err instanceof TeamClientError || err instanceof CatalogClientError
          ? err.message
          : genericError
      );
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  function getStatusLabel(status: TransferStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  function getWarehouseLabel(warehouseId: string): string {
    return warehouseMap.get(warehouseId) ?? warehouseId;
  }

  return (
    <div data-testid="transfers-panel">
      {loading ? (
        <p role="status" className="text-sm text-neutral-600">
          Memuat daftar transfer…
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-800"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 min-h-[44px] rounded-lg border border-error-300 bg-white px-4 py-2 font-semibold hover:bg-error-100"
          >
            Coba lagi
          </button>
        </div>
      ) : null}

      {!loading && !error && transfers.length === 0 ? (
        <p
          data-testid="transfers-empty"
          className="rounded-lg border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-600"
        >
          Belum ada transfer di workspace ini.
        </p>
      ) : null}

      {!loading && !error && transfers.length > 0 ? (
        <div className="overflow-x-auto">
          <table
            data-testid="transfers-list"
            className="w-full text-left text-sm"
          >
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="pb-2 font-semibold text-neutral-700">
                  Referensi
                </th>
                <th className="pb-2 font-semibold text-neutral-700">Dari</th>
                <th className="pb-2 font-semibold text-neutral-700">Ke</th>
                <th className="pb-2 font-semibold text-neutral-700">Status</th>
                <th className="pb-2 font-semibold text-neutral-700">
                  Diperbarui
                </th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr
                  key={transfer.id}
                  data-testid="transfer-row"
                  className="border-b border-neutral-100"
                >
                  <td className="py-3 font-mono text-neutral-900">
                    {transfer.referenceNum}
                  </td>
                  <td className="py-3 text-neutral-700">
                    {getWarehouseLabel(transfer.sourceWarehouseId)}
                  </td>
                  <td className="py-3 text-neutral-700">
                    {getWarehouseLabel(transfer.destWarehouseId)}
                  </td>
                  <td className="py-3">
                    <span
                      data-testid="transfer-status"
                      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                        transfer.status === 'draft'
                          ? 'bg-neutral-200 text-neutral-700'
                          : transfer.status === 'sent'
                            ? 'bg-warning-100 text-warning-800'
                            : transfer.status === 'received'
                              ? 'bg-success-100 text-success-800'
                              : 'bg-error-100 text-error-800'
                      }`}
                    >
                      {getStatusLabel(transfer.status)}
                    </span>
                  </td>
                  <td className="py-3 text-neutral-600">
                    {formatDateTime(transfer.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

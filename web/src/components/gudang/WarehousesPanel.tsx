'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CatalogClientError,
  listWarehouses,
  type WarehouseView,
} from '@/lib/catalog-client';
import { getMyMembership, TeamClientError } from '@/lib/team-client';

const genericError = 'Daftar gudang tidak dapat dimuat. Silakan coba lagi.';

/**
 * Read-only warehouse list (UTA-135).
 *
 * The active workspace comes from the caller's cookie-backed membership;
 * opaque workspace ids never need to be copied into the UI. Mutations are
 * deliberately excluded from this slice.
 */
export function WarehousesPanel() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const membership = await getMyMembership();
      setWarehouses(await listWarehouses(membership.workspaceId));
    } catch (err) {
      if (
        (err instanceof TeamClientError || err instanceof CatalogClientError) &&
        err.needsReauth
      ) {
        router.replace('/sign-in?expired=1');
        return;
      }

      setWarehouses([]);
      setError(
        err instanceof TeamClientError || err instanceof CatalogClientError
          ? err.message
          : genericError
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div data-testid="warehouses-panel">
      {loading ? (
        <p role="status" className="text-sm text-neutral-600">
          Memuat daftar gudang…
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

      {!loading && !error && warehouses.length === 0 ? (
        <p
          data-testid="warehouses-empty"
          className="rounded-lg border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-600"
        >
          Belum ada gudang di workspace ini.
        </p>
      ) : null}

      {!loading && !error && warehouses.length > 0 ? (
        <ul data-testid="warehouses-list" className="space-y-3">
          {warehouses.map((warehouse) => {
            const active = warehouse.status === 'active';
            return (
              <li
                key={warehouse.id}
                data-testid="warehouse-row"
                className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-neutral-900">
                    {warehouse.name}
                  </p>
                  <p className="mt-1 break-all font-mono text-sm text-neutral-600">
                    {warehouse.code}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    active
                      ? 'bg-success-100 text-success-800'
                      : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {active ? 'Aktif' : 'Nonaktif'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

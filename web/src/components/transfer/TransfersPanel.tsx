'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CatalogClientError,
  createTransferDraft,
  listTransfers,
  listWarehouses,
  type TransferView,
  type TransferStatus,
  type WarehouseView,
} from '@/lib/catalog-client';
import {
  getMyMembership,
  TeamClientError,
  type WorkspaceRole,
} from '@/lib/team-client';

const genericError = 'Daftar transfer tidak dapat dimuat. Silakan coba lagi.';
const mutationGenericError = 'Draft transfer gagal dibuat. Silakan coba lagi.';
const conflictError =
  'Nomor referensi bentrok atau data sudah berubah. Silakan coba lagi.';
const validationError =
  'Nomor referensi, gudang asal, dan gudang tujuan wajib diisi.';
const sameWarehouseError = 'Gudang asal dan tujuan harus berbeda.';
const noWarehousesMessage =
  'Belum ada gudang aktif. Buat gudang di menu Gudang terlebih dahulu sebelum membuat draft transfer.';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'aria-[invalid=true]:border-error-500 min-h-[44px]';

const labelClass = 'block text-sm font-medium text-neutral-700 mb-1';

const primaryButtonClass =
  'rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] inline-flex items-center justify-center ' +
  'font-semibold text-white hover:bg-primary-600 disabled:opacity-50';

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

export type TransferDraftFormValues = {
  referenceNum: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  notes: string;
};

/**
 * Pure validator for create-draft form (UTA-138).
 * Returns null when valid, otherwise a Bahasa Indonesia error message.
 */
export function validateTransferDraftForm(
  values: TransferDraftFormValues
): string | null {
  const referenceNum = values.referenceNum.trim();
  const sourceWarehouseId = values.sourceWarehouseId.trim();
  const destWarehouseId = values.destWarehouseId.trim();
  if (!referenceNum || !sourceWarehouseId || !destWarehouseId) {
    return validationError;
  }
  if (sourceWarehouseId === destWarehouseId) {
    return sameWarehouseError;
  }
  return null;
}

/**
 * Transfer list + Manager/Admin create-draft chrome (UTA-138).
 *
 * Keeps the UTA-137 read-only list and adds create-draft wired to
 * `createTransferDraft`. Staff sees the list only (chrome RBAC; server
 * remains authority). Items / send / receive / cancel stay out of scope.
 */
export function TransfersPanel() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [transfers, setTransfers] = useState<TransferView[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [referenceNum, setReferenceNum] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destWarehouseId, setDestWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canWrite = role === 'admin' || role === 'manager';

  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.status === 'active'),
    [warehouses]
  );

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
      setWorkspaceId(membership.workspaceId);
      setRole(membership.role);
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
      setWorkspaceId(null);
      setRole(null);
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

  function mapMutationError(err: unknown): string {
    if (err instanceof CatalogClientError) {
      if (err.status === 409) return conflictError;
      return err.message;
    }
    return mutationGenericError;
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !canWrite) return;

    const validation = validateTransferDraftForm({
      referenceNum,
      sourceWarehouseId,
      destWarehouseId,
      notes,
    });
    if (validation) {
      setCreateError(validation);
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const trimmedNotes = notes.trim();
      const created = await createTransferDraft(workspaceId, {
        referenceNum: referenceNum.trim(),
        sourceWarehouseId,
        destWarehouseId,
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      setTransfers((prev) => [created, ...prev]);
      setReferenceNum('');
      setSourceWarehouseId('');
      setDestWarehouseId('');
      setNotes('');
    } catch (err) {
      if (handleAuthError(err)) return;
      if (err instanceof CatalogClientError && err.status === 409) {
        setCreateError(conflictError);
        void load();
        return;
      }
      setCreateError(mapMutationError(err));
    } finally {
      setCreating(false);
    }
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

      {!loading && !error && role === 'staff' ? (
        <p
          data-testid="transfers-readonly-note"
          className="mb-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
        >
          Anda dapat melihat daftar transfer. Hanya Manager/Admin yang dapat
          membuat draft transfer.
        </p>
      ) : null}

      {!loading && !error && canWrite ? (
        <form
          data-testid="transfer-create-form"
          onSubmit={(e) => void onCreate(e)}
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <h2 className="text-lg font-semibold text-neutral-900">
            Buat draft transfer
          </h2>
          <p className="text-sm text-neutral-600">
            Buat draft transfer antar gudang. Baris item, kirim, dan terima
            ditambahkan nanti.
          </p>

          {activeWarehouses.length === 0 ? (
            <p
              role="status"
              data-testid="transfer-create-no-warehouses"
              className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-700"
            >
              {noWarehousesMessage}
            </p>
          ) : null}

          {createError ? (
            <p
              role="alert"
              data-testid="transfer-create-error"
              className="mt-2 text-sm text-error-500"
            >
              {createError}
            </p>
          ) : null}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="transfer-create-ref" className={labelClass}>
                Nomor referensi
              </label>
              <input
                id="transfer-create-ref"
                data-testid="transfer-create-ref"
                className={`${inputClass} font-mono`}
                placeholder="TRF-001"
                value={referenceNum}
                onChange={(e) => setReferenceNum(e.target.value)}
                disabled={creating || activeWarehouses.length === 0}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="transfer-create-source" className={labelClass}>
                Dari gudang
              </label>
              <select
                id="transfer-create-source"
                data-testid="transfer-create-source"
                className={inputClass}
                value={sourceWarehouseId}
                onChange={(e) => setSourceWarehouseId(e.target.value)}
                disabled={creating || activeWarehouses.length === 0}
              >
                <option value="">Pilih gudang asal</option>
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="transfer-create-dest" className={labelClass}>
                Ke gudang
              </label>
              <select
                id="transfer-create-dest"
                data-testid="transfer-create-dest"
                className={inputClass}
                value={destWarehouseId}
                onChange={(e) => setDestWarehouseId(e.target.value)}
                disabled={creating || activeWarehouses.length === 0}
              >
                <option value="">Pilih gudang tujuan</option>
                {activeWarehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="transfer-create-notes" className={labelClass}>
                Catatan (opsional)
              </label>
              <textarea
                id="transfer-create-notes"
                data-testid="transfer-create-notes"
                className={`${inputClass} min-h-[88px]`}
                placeholder="Catatan untuk draft ini"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={creating || activeWarehouses.length === 0}
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              type="submit"
              data-testid="transfer-create-submit"
              disabled={creating || activeWarehouses.length === 0}
              className={primaryButtonClass}
            >
              {creating ? 'Menyimpan…' : 'Buat draft transfer'}
            </button>
          </div>
        </form>
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

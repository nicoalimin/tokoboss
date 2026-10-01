'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CatalogClientError,
  createWarehouse,
  listWarehouses,
  updateWarehouse,
  type WarehouseView,
} from '@/lib/catalog-client';
import {
  getMyMembership,
  TeamClientError,
  type WorkspaceRole,
} from '@/lib/team-client';

const genericError = 'Daftar gudang tidak dapat dimuat. Silakan coba lagi.';
const mutationGenericError = 'Perubahan gudang gagal. Silakan coba lagi.';
const conflictError =
  'Data gudang sudah berubah. Daftar dimuat ulang — silakan coba lagi.';
const createValidationError = 'Kode dan nama gudang wajib diisi.';
const renameValidationError = 'Nama gudang wajib diisi.';
const deactivateConfirm =
  'Nonaktifkan gudang ini? Stok tetap ada; gudang tidak bisa dipilih untuk penyesuaian baru.';
const activateConfirm = 'Aktifkan kembali gudang ini?';

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'aria-[invalid=true]:border-error-500 min-h-[44px]';

const labelClass = 'block text-sm font-medium text-neutral-700 mb-1';

const primaryButtonClass =
  'rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] inline-flex items-center justify-center ' +
  'font-semibold text-white hover:bg-primary-600 disabled:opacity-50';

const secondaryButtonClass =
  'rounded-lg border border-neutral-300 bg-white px-4 py-2 min-h-[44px] inline-flex items-center ' +
  'text-sm font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50';

/**
 * Warehouse list + Manager/Admin write chrome (UTA-136).
 *
 * Keeps the UTA-135 read-only list UX and adds create / rename /
 * deactivate-reactivate wired to `createWarehouse` / `updateWarehouse`.
 * Staff sees the list only (chrome RBAC; server remains authority).
 */
export function WarehousesPanel() {
  const router = useRouter();
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const canWrite = role === 'admin' || role === 'manager';

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
      setWarehouses(await listWarehouses(membership.workspaceId));
    } catch (err) {
      if (handleAuthError(err)) return;

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

    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) {
      setCreateError(createValidationError);
      return;
    }

    setCreating(true);
    setCreateError(null);
    setRowError(null);

    try {
      const created = await createWarehouse(workspaceId, { code, name });
      setWarehouses((prev) => [created, ...prev]);
      setNewCode('');
      setNewName('');
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

  function startRename(warehouse: WarehouseView) {
    setRenamingId(warehouse.id);
    setRenameDraft(warehouse.name);
    setRowError(null);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameDraft('');
  }

  async function onRename(warehouse: WarehouseView) {
    if (!workspaceId || !canWrite) return;

    const name = renameDraft.trim();
    if (!name) {
      setRowError({ id: warehouse.id, message: renameValidationError });
      return;
    }

    setRenaming(true);
    setRowError(null);

    try {
      const updated = await updateWarehouse(workspaceId, warehouse.id, {
        expectedVersion: warehouse.version,
        name,
      });
      setWarehouses((prev) =>
        prev.map((w) => (w.id === updated.id ? updated : w))
      );
      setRenamingId(null);
      setRenameDraft('');
    } catch (err) {
      if (handleAuthError(err)) return;
      if (err instanceof CatalogClientError && err.status === 409) {
        setRowError({ id: warehouse.id, message: conflictError });
        setRenamingId(null);
        setRenameDraft('');
        void load();
        return;
      }
      setRowError({ id: warehouse.id, message: mapMutationError(err) });
    } finally {
      setRenaming(false);
    }
  }

  async function onToggleStatus(warehouse: WarehouseView) {
    if (!workspaceId || !canWrite) return;

    const nextStatus = warehouse.status === 'active' ? 'deactivated' : 'active';
    const confirmMsg =
      nextStatus === 'deactivated' ? deactivateConfirm : activateConfirm;
    if (!window.confirm(confirmMsg)) return;

    setStatusBusyId(warehouse.id);
    setRowError(null);

    try {
      const updated = await updateWarehouse(workspaceId, warehouse.id, {
        expectedVersion: warehouse.version,
        status: nextStatus,
      });
      setWarehouses((prev) =>
        prev.map((w) => (w.id === updated.id ? updated : w))
      );
    } catch (err) {
      if (handleAuthError(err)) return;
      if (err instanceof CatalogClientError && err.status === 409) {
        setRowError({ id: warehouse.id, message: conflictError });
        void load();
        return;
      }
      setRowError({ id: warehouse.id, message: mapMutationError(err) });
    } finally {
      setStatusBusyId(null);
    }
  }

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

      {!loading && !error && role === 'staff' ? (
        <p
          data-testid="warehouses-readonly-note"
          className="mb-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
        >
          Anda dapat melihat daftar gudang. Hanya Manager/Admin yang dapat
          menambah, mengubah nama, atau menonaktifkan gudang.
        </p>
      ) : null}

      {!loading && !error && canWrite ? (
        <form
          data-testid="warehouse-create-form"
          onSubmit={(e) => void onCreate(e)}
          className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <h2 className="text-lg font-semibold text-neutral-900">
            Tambah gudang
          </h2>
          <p className="text-sm text-neutral-600">
            Buat gudang baru dengan kode unik dan nama yang mudah dikenali.
          </p>
          {createError ? (
            <p
              role="alert"
              data-testid="warehouse-create-error"
              className="mt-2 text-sm text-error-500"
            >
              {createError}
            </p>
          ) : null}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="warehouse-create-code" className={labelClass}>
                Kode
              </label>
              <input
                id="warehouse-create-code"
                data-testid="warehouse-create-code"
                className={`${inputClass} font-mono`}
                placeholder="JKT-01"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                disabled={creating}
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="warehouse-create-name" className={labelClass}>
                Nama
              </label>
              <input
                id="warehouse-create-name"
                data-testid="warehouse-create-name"
                className={inputClass}
                placeholder="Gudang Jakarta"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                autoComplete="off"
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              type="submit"
              data-testid="warehouse-create-submit"
              disabled={creating}
              className={primaryButtonClass}
            >
              {creating ? 'Menyimpan…' : 'Tambah gudang'}
            </button>
          </div>
        </form>
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
            const isRenaming = renamingId === warehouse.id;
            const busyStatus = statusBusyId === warehouse.id;
            const thisRowError =
              rowError?.id === warehouse.id ? rowError.message : null;
            return (
              <li
                key={warehouse.id}
                data-testid="warehouse-row"
                className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="space-y-2">
                        <label
                          htmlFor={`warehouse-rename-${warehouse.id}`}
                          className={labelClass}
                        >
                          Nama baru
                        </label>
                        <input
                          id={`warehouse-rename-${warehouse.id}`}
                          data-testid="warehouse-rename-input"
                          className={inputClass}
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          disabled={renaming}
                          autoComplete="off"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            data-testid="warehouse-rename-save"
                            disabled={renaming}
                            onClick={() => void onRename(warehouse)}
                            className={primaryButtonClass}
                          >
                            {renaming ? 'Menyimpan…' : 'Simpan'}
                          </button>
                          <button
                            type="button"
                            data-testid="warehouse-rename-cancel"
                            disabled={renaming}
                            onClick={cancelRename}
                            className={secondaryButtonClass}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-semibold text-neutral-900">
                          {warehouse.name}
                        </p>
                        <p className="mt-1 break-all font-mono text-sm text-neutral-600">
                          {warehouse.code}
                        </p>
                      </>
                    )}
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
                </div>

                {thisRowError ? (
                  <p
                    role="alert"
                    data-testid="warehouse-row-error"
                    className="mt-3 text-sm text-error-500"
                  >
                    {thisRowError}
                  </p>
                ) : null}

                {canWrite && !isRenaming ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="warehouse-rename"
                      disabled={renaming || busyStatus}
                      onClick={() => startRename(warehouse)}
                      className={secondaryButtonClass}
                    >
                      Ubah nama
                    </button>
                    {active ? (
                      <button
                        type="button"
                        data-testid="warehouse-deactivate"
                        disabled={busyStatus || renaming}
                        onClick={() => void onToggleStatus(warehouse)}
                        className={secondaryButtonClass}
                      >
                        {busyStatus ? 'Memproses…' : 'Nonaktifkan'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="warehouse-activate"
                        disabled={busyStatus || renaming}
                        onClick={() => void onToggleStatus(warehouse)}
                        className={secondaryButtonClass}
                      >
                        {busyStatus ? 'Memproses…' : 'Aktifkan'}
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CatalogClientError,
  addTransferItems,
  createTransferDraft,
  getTransfer,
  listProducts,
  listTransfers,
  listWarehouses,
  searchCatalog,
  sendTransfer,
  receiveTransfer,
  type TransferItemView,
  type TransferView,
  type TransferStatus,
  type VariantView,
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
const detailGenericError =
  'Detail draft transfer tidak dapat dimuat. Silakan coba lagi.';
const addItemsGenericError = 'Item gagal ditambahkan. Silakan coba lagi.';
const addItemsValidationError =
  'SKU dan jumlah (bilangan bulat positif) wajib diisi.';
const sendGenericError = 'Gagal mengirim transfer. Silakan coba lagi.';
const sendConflictError =
  'Nomor referensi bentrok atau data sudah berubah. Silakan coba lagi.';
const receiveGenericError = 'Gagal menerima transfer. Silakan coba lagi.';
const receiveConflictError =
  'Data transfer sudah berubah. Muat ulang lalu coba terima lagi.';

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
  'justify-center font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';

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
 * Pure guard: can this role send a draft with the given items? (UTA-140)
 * Returns true only when the role is admin or manager, status is 'draft',
 * and there is at least one line item.
 */
export function canSendDraft(
  role: WorkspaceRole,
  status: TransferStatus,
  itemCount: number
): boolean {
  if (role !== 'admin' && role !== 'manager') return false;
  if (status !== 'draft') return false;
  if (itemCount < 1) return false;
  return true;
}

/**
 * Pure guard: can this role fully receive a sent transfer? (UTA-141)
 * Returns true only when the role is admin or manager and status is 'sent'.
 */
export function canReceiveSent(
  role: WorkspaceRole,
  status: TransferStatus
): boolean {
  if (role !== 'admin' && role !== 'manager') return false;
  if (status !== 'sent') return false;
  return true;
}

export type TransferAddItemsFormValues = {
  variantId: string;
  requestedQty: string;
};

/**
 * Pure validator for draft add-items form (UTA-139).
 * Returns null when valid, otherwise a Bahasa Indonesia error message.
 */
export function validateTransferAddItemsForm(
  values: TransferAddItemsFormValues
): string | null {
  const variantId = values.variantId.trim();
  const raw = values.requestedQty.trim();
  if (!variantId || !raw) {
    return addItemsValidationError;
  }
  if (!/^\d+$/.test(raw)) {
    return addItemsValidationError;
  }
  const qty = Number.parseInt(raw, 10);
  if (!Number.isFinite(qty) || qty < 1) {
    return addItemsValidationError;
  }
  return null;
}

type SkuOption = {
  variantId: string;
  skuCode: string;
  label: string;
};

function variantsToSkuOptions(variants: VariantView[]): SkuOption[] {
  const options: SkuOption[] = [];
  for (const v of variants) {
    if (v.status !== 'active') continue;
    const namePart = v.name?.trim() ? ` — ${v.name.trim()}` : '';
    options.push({
      variantId: v.id,
      skuCode: v.skuCode,
      label: `${v.skuCode}${namePart}`,
    });
  }
  return options;
}

function productsToSkuOptions(
  products: Array<{ name: string; variants?: VariantView[] }>
): SkuOption[] {
  const options: SkuOption[] = [];
  for (const p of products) {
    for (const v of p.variants ?? []) {
      if (v.status !== 'active') continue;
      const namePart = v.name?.trim()
        ? ` — ${v.name.trim()}`
        : p.name.trim()
          ? ` — ${p.name.trim()}`
          : '';
      options.push({
        variantId: v.id,
        skuCode: v.skuCode,
        label: `${v.skuCode}${namePart}`,
      });
    }
  }
  return options;
}

/**
 * Transfer list + create-draft (UTA-138) + draft add-items (UTA-139).
 *
 * Manager/Admin can open a draft, view items, and add line items via
 * `getTransfer` / `addTransferItems`. Staff is read-only for mutations.
 * Send / receive / cancel stay out of scope.
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

  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(
    null
  );
  const [selectedTransfer, setSelectedTransfer] = useState<TransferView | null>(
    null
  );
  const [selectedItems, setSelectedItems] = useState<TransferItemView[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [skuCodeByVariantId, setSkuCodeByVariantId] = useState<
    Map<string, string>
  >(() => new Map());
  const [skuQuery, setSkuQuery] = useState('');
  const [skuSearching, setSkuSearching] = useState(false);
  const [addVariantId, setAddVariantId] = useState('');
  const [addQty, setAddQty] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Send transfer state (UTA-140)
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Receive transfer state (UTA-141)
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

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

  const mergeSkuLookup = useCallback((options: SkuOption[]) => {
    setSkuOptions((prev) => {
      const byId = new Map(prev.map((o) => [o.variantId, o]));
      for (const o of options) byId.set(o.variantId, o);
      return Array.from(byId.values()).sort((a, b) =>
        a.skuCode.localeCompare(b.skuCode)
      );
    });
    setSkuCodeByVariantId((prev) => {
      const next = new Map(prev);
      for (const o of options) next.set(o.variantId, o.skuCode);
      return next;
    });
  }, []);

  const loadSkuCatalog = useCallback(
    async (ws: string) => {
      try {
        const products = await listProducts(ws, { status: 'active' });
        mergeSkuLookup(productsToSkuOptions(products));
      } catch (err) {
        if (handleAuthError(err)) return;
        // Catalog lookup is best-effort for skuCode labels; detail still works.
      }
    },
    [handleAuthError, mergeSkuLookup]
  );

  const loadDraftDetail = useCallback(
    async (ws: string, transferId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const detail = await getTransfer(ws, transferId);
        setSelectedTransfer(detail.transfer);
        setSelectedItems(detail.items);
        setTransfers((prev) =>
          prev.map((t) => (t.id === detail.transfer.id ? detail.transfer : t))
        );
      } catch (err) {
        if (handleAuthError(err)) return;
        setSelectedTransfer(null);
        setSelectedItems([]);
        setDetailError(
          err instanceof CatalogClientError ? err.message : detailGenericError
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [handleAuthError]
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
      void loadSkuCatalog(membership.workspaceId);
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
  }, [handleAuthError, loadSkuCatalog]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!workspaceId || !selectedTransferId) return;
    void loadDraftDetail(workspaceId, selectedTransferId);
  }, [workspaceId, selectedTransferId, loadDraftDetail]);

  useEffect(() => {
    if (!workspaceId) return;
    const needle = skuQuery.trim();
    if (!needle) return;

    const timer = setTimeout(() => {
      void (async () => {
        setSkuSearching(true);
        try {
          const { products, variants } = await searchCatalog(
            workspaceId,
            needle
          );
          const fromProducts = productsToSkuOptions(products);
          const fromVariants = variantsToSkuOptions(variants);
          mergeSkuLookup([...fromProducts, ...fromVariants]);
          if (fromProducts.length === 0 && fromVariants.length > 0) {
            // Variant-only hits: also pull parent products for richer labels.
            const listed = await listProducts(workspaceId, {
              q: needle,
              status: 'active',
            });
            mergeSkuLookup(productsToSkuOptions(listed));
          }
        } catch (err) {
          if (handleAuthError(err)) return;
        } finally {
          setSkuSearching(false);
        }
      })();
    }, 250);

    return () => clearTimeout(timer);
  }, [skuQuery, workspaceId, mergeSkuLookup, handleAuthError]);

  function getStatusLabel(status: TransferStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  function getWarehouseLabel(warehouseId: string): string {
    return warehouseMap.get(warehouseId) ?? warehouseId;
  }

  function getSkuLabel(variantId: string): string {
    return skuCodeByVariantId.get(variantId) ?? variantId;
  }

  function mapMutationError(err: unknown): string {
    if (err instanceof CatalogClientError) {
      if (err.status === 409) return conflictError;
      return err.message;
    }
    return mutationGenericError;
  }

  function mapAddItemsError(err: unknown): string {
    if (err instanceof CatalogClientError) {
      return err.message;
    }
    return addItemsGenericError;
  }

  function clearDraftSelection() {
    setSelectedTransferId(null);
    setSelectedTransfer(null);
    setSelectedItems([]);
    setDetailError(null);
    setAddVariantId('');
    setAddQty('');
    setAddError(null);
    setSkuQuery('');
    setSendError(null);
    setSending(false);
    setReceiveError(null);
    setReceiving(false);
  }

  function onSelectOpen(transfer: TransferView) {
    if (transfer.status !== 'draft' && transfer.status !== 'sent') return;
    if (selectedTransferId === transfer.id) {
      clearDraftSelection();
      return;
    }
    setSelectedTransferId(transfer.id);
    setSelectedTransfer(transfer);
    setSelectedItems([]);
    setDetailError(null);
    setAddError(null);
    setAddVariantId('');
    setAddQty('');
    setSendError(null);
    setReceiveError(null);
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
      setSelectedTransferId(created.id);
      setSelectedTransfer(created);
      setSelectedItems([]);
      setDetailError(null);
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

  async function onAddItems(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId || !canWrite || !selectedTransferId) return;
    if (selectedTransfer && selectedTransfer.status !== 'draft') return;

    const validation = validateTransferAddItemsForm({
      variantId: addVariantId,
      requestedQty: addQty,
    });
    if (validation) {
      setAddError(validation);
      return;
    }

    const requestedQty = Number.parseInt(addQty.trim(), 10);
    setAdding(true);
    setAddError(null);

    try {
      await addTransferItems(workspaceId, selectedTransferId, {
        items: [{ variantId: addVariantId.trim(), requestedQty }],
      });
      setAddVariantId('');
      setAddQty('');
      await loadDraftDetail(workspaceId, selectedTransferId);
    } catch (err) {
      if (handleAuthError(err)) return;
      setAddError(mapAddItemsError(err));
    } finally {
      setAdding(false);
    }
  }

  // ── UTA-140: Send transfer ──────────────────────────────────────────

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (
      !workspaceId ||
      !canWrite ||
      !selectedTransferId ||
      !selectedTransfer ||
      selectedTransfer.status !== 'draft'
    ) {
      return;
    }
    if (selectedItems.length === 0) return;

    if (!confirm('Kirim transfer?')) return;

    setSending(true);
    setSendError(null);

    try {
      const result = await sendTransfer(workspaceId, selectedTransferId, {
        expectedVersion: selectedTransfer.version,
      });
      // Update the list and selected transfer with the new status
      setTransfers((prev) =>
        prev.map((t) => (t.id === result.transfer.id ? result.transfer : t))
      );
      setSelectedTransfer(result.transfer);
      setSelectedItems(result.items);
      // Clear selection since status is no longer draft
      setTimeout(() => {
        clearDraftSelection();
      }, 1500);
    } catch (err) {
      if (handleAuthError(err)) return;
      if (err instanceof CatalogClientError) {
        if (err.status === 409) {
          setSendError(sendConflictError);
          // Reload latest state on conflict
          void loadDraftDetail(workspaceId, selectedTransferId);
          return;
        }
        setSendError(err.message);
        return;
      }
      setSendError(sendGenericError);
    } finally {
      setSending(false);
    }
  }

  // ── UTA-141: Receive transfer (full) ────────────────────────────────

  async function onReceive(e: React.FormEvent) {
    e.preventDefault();
    if (
      !workspaceId ||
      !canWrite ||
      !selectedTransferId ||
      !selectedTransfer ||
      selectedTransfer.status !== 'sent'
    ) {
      return;
    }
    if (!role || !canReceiveSent(role, selectedTransfer.status)) return;

    if (!confirm('Terima transfer?')) return;

    setReceiving(true);
    setReceiveError(null);

    try {
      // Full receive: omit items (API treats empty body as full accept-in).
      const result = await receiveTransfer(workspaceId, selectedTransferId, {
        expectedVersion: selectedTransfer.version,
      });
      setTransfers((prev) =>
        prev.map((t) => (t.id === result.transfer.id ? result.transfer : t))
      );
      setSelectedTransfer(result.transfer);
      setSelectedItems(result.items);
      setTimeout(() => {
        clearDraftSelection();
      }, 1500);
    } catch (err) {
      if (handleAuthError(err)) return;
      if (err instanceof CatalogClientError) {
        if (err.status === 409) {
          setReceiveError(receiveConflictError);
          void loadDraftDetail(workspaceId, selectedTransferId);
          return;
        }
        setReceiveError(err.message);
        return;
      }
      setReceiveError(receiveGenericError);
    } finally {
      setReceiving(false);
    }
  }

  const draftSelected =
    selectedTransferId !== null &&
    (selectedTransfer?.status === 'draft' ||
      transfers.some(
        (t) => t.id === selectedTransferId && t.status === 'draft'
      ));

  const sentSelected =
    selectedTransferId !== null &&
    (selectedTransfer?.status === 'sent' ||
      transfers.some(
        (t) => t.id === selectedTransferId && t.status === 'sent'
      ));

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
          membuat draft, menambah item, mengirim, atau menerima transfer.
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
            Buat draft transfer antar gudang. Setelah dibuat, pilih draft untuk
            menambah baris item.
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
                <th className="pb-2 font-semibold text-neutral-700">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => {
                const isDraft = transfer.status === 'draft';
                const isSent = transfer.status === 'sent';
                const canOpen = isDraft || isSent;
                const isSelected = selectedTransferId === transfer.id;
                return (
                  <tr
                    key={transfer.id}
                    data-testid="transfer-row"
                    data-transfer-id={transfer.id}
                    data-selected={isSelected ? 'true' : 'false'}
                    className={`border-b border-neutral-100 ${
                      isSelected ? 'bg-primary-50' : ''
                    }`}
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
                    <td className="py-3">
                      {canOpen ? (
                        <button
                          type="button"
                          data-testid={
                            isDraft
                              ? 'transfer-open-draft'
                              : 'transfer-open-sent'
                          }
                          onClick={() => onSelectOpen(transfer)}
                          className={secondaryButtonClass}
                        >
                          {isSelected
                            ? 'Tutup'
                            : isDraft
                              ? 'Buka draft'
                              : 'Buka'}
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !error && selectedTransferId && draftSelected ? (
        <section
          data-testid="transfer-draft-detail"
          className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Draft terpilih
              </h2>
              <p
                data-testid="transfer-draft-selected-ref"
                className="font-mono text-sm text-neutral-800"
              >
                {selectedTransfer?.referenceNum ?? selectedTransferId}
              </p>
              {selectedTransfer ? (
                <p className="mt-1 text-sm text-neutral-600">
                  {getWarehouseLabel(selectedTransfer.sourceWarehouseId)} →{' '}
                  {getWarehouseLabel(selectedTransfer.destWarehouseId)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              data-testid="transfer-draft-clear"
              onClick={clearDraftSelection}
              className={secondaryButtonClass}
            >
              Tutup
            </button>
          </div>

          {detailLoading ? (
            <p role="status" className="mt-3 text-sm text-neutral-600">
              Memuat item draft…
            </p>
          ) : null}

          {detailError ? (
            <div
              role="alert"
              data-testid="transfer-draft-detail-error"
              className="mt-3 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800"
            >
              <p>{detailError}</p>
              <button
                type="button"
                onClick={() =>
                  workspaceId && selectedTransferId
                    ? void loadDraftDetail(workspaceId, selectedTransferId)
                    : undefined
                }
                className="mt-2 min-h-[44px] rounded-lg border border-error-300 bg-white px-4 py-2 font-semibold hover:bg-error-100"
              >
                Coba lagi
              </button>
            </div>
          ) : null}

          {!detailLoading && !detailError ? (
            <>
              {selectedItems.length === 0 ? (
                <p
                  data-testid="transfer-draft-items-empty"
                  className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600"
                >
                  Belum ada item pada draft ini.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table
                    data-testid="transfer-draft-items"
                    className="w-full text-left text-sm"
                  >
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="pb-2 font-semibold text-neutral-700">
                          SKU
                        </th>
                        <th className="pb-2 font-semibold text-neutral-700">
                          Jumlah
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((item) => (
                        <tr
                          key={item.id}
                          data-testid="transfer-draft-item-row"
                          className="border-b border-neutral-100"
                        >
                          <td className="py-2 font-mono text-neutral-900">
                            {getSkuLabel(item.variantId)}
                          </td>
                          <td className="py-2 text-neutral-800">
                            {item.requestedQty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canWrite ? (
                <form
                  data-testid="transfer-add-items-form"
                  onSubmit={(e) => void onAddItems(e)}
                  className="mt-4 border-t border-neutral-100 pt-4"
                >
                  <h3 className="text-base font-semibold text-neutral-900">
                    Tambah item
                  </h3>
                  <p className="text-sm text-neutral-600">
                    Pilih SKU aktif dan jumlah yang diminta untuk draft ini.
                  </p>

                  {addError ? (
                    <p
                      role="alert"
                      data-testid="transfer-add-items-error"
                      className="mt-2 text-sm text-error-500"
                    >
                      {addError}
                    </p>
                  ) : null}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="transfer-add-sku-search"
                        className={labelClass}
                      >
                        Cari SKU
                      </label>
                      <input
                        id="transfer-add-sku-search"
                        data-testid="transfer-add-sku-search"
                        className={inputClass}
                        placeholder="Cari nama / SKU / barcode"
                        value={skuQuery}
                        onChange={(e) => setSkuQuery(e.target.value)}
                        disabled={adding}
                        autoComplete="off"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        {skuSearching
                          ? 'Mencari…'
                          : 'Kosongkan untuk memakai daftar produk aktif.'}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="transfer-add-sku" className={labelClass}>
                        SKU
                      </label>
                      <select
                        id="transfer-add-sku"
                        data-testid="transfer-add-sku"
                        className={inputClass}
                        value={addVariantId}
                        onChange={(e) => setAddVariantId(e.target.value)}
                        disabled={adding || skuOptions.length === 0}
                      >
                        <option value="">Pilih SKU</option>
                        {skuOptions.map((o) => (
                          <option key={o.variantId} value={o.variantId}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="transfer-add-qty" className={labelClass}>
                        Jumlah
                      </label>
                      <input
                        id="transfer-add-qty"
                        data-testid="transfer-add-qty"
                        className={inputClass}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="1"
                        value={addQty}
                        onChange={(e) => setAddQty(e.target.value)}
                        disabled={adding}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <button
                      type="submit"
                      data-testid="transfer-add-items-submit"
                      disabled={adding || skuOptions.length === 0}
                      className={primaryButtonClass}
                    >
                      {adding ? 'Menyimpan…' : 'Tambah item'}
                    </button>
                  </div>
                </form>
              ) : (
                <p
                  data-testid="transfer-add-items-readonly"
                  className="mt-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
                >
                  Hanya Manager/Admin yang dapat menambah item pada draft.
                </p>
              )}

              {/* UTA-140: Send transfer button (Manager/Admin only) */}
              {canWrite && selectedItems.length > 0 ? (
                <div className="mt-4 border-t border-neutral-100 pt-4">
                  {sendError ? (
                    <p
                      role="alert"
                      data-testid="transfer-send-error"
                      className="mb-2 text-sm text-error-500"
                    >
                      {sendError}
                    </p>
                  ) : null}
                  <p className="mb-3 text-sm text-neutral-600">
                    Kirim draft transfer ini ke gudang tujuan.
                  </p>
                  <button
                    type="button"
                    data-testid="transfer-send-button"
                    onClick={(e) => void onSend(e)}
                    disabled={sending}
                    className={primaryButtonClass}
                  >
                    {sending ? 'Mengirim…' : 'Kirim transfer'}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {!loading && !error && selectedTransferId && sentSelected ? (
        <section
          data-testid="transfer-sent-detail"
          className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Transfer dikirim
              </h2>
              <p
                data-testid="transfer-sent-selected-ref"
                className="font-mono text-sm text-neutral-800"
              >
                {selectedTransfer?.referenceNum ?? selectedTransferId}
              </p>
              {selectedTransfer ? (
                <p className="mt-1 text-sm text-neutral-600">
                  {getWarehouseLabel(selectedTransfer.sourceWarehouseId)} →{' '}
                  {getWarehouseLabel(selectedTransfer.destWarehouseId)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              data-testid="transfer-sent-clear"
              onClick={clearDraftSelection}
              className={secondaryButtonClass}
            >
              Tutup
            </button>
          </div>

          {detailLoading ? (
            <p role="status" className="mt-3 text-sm text-neutral-600">
              Memuat item transfer…
            </p>
          ) : null}

          {detailError ? (
            <div
              role="alert"
              data-testid="transfer-sent-detail-error"
              className="mt-3 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800"
            >
              <p>{detailError}</p>
              <button
                type="button"
                onClick={() =>
                  workspaceId && selectedTransferId
                    ? void loadDraftDetail(workspaceId, selectedTransferId)
                    : undefined
                }
                className="mt-2 min-h-[44px] rounded-lg border border-error-300 bg-white px-4 py-2 font-semibold hover:bg-error-100"
              >
                Coba lagi
              </button>
            </div>
          ) : null}

          {!detailLoading && !detailError ? (
            <>
              {selectedItems.length === 0 ? (
                <p
                  data-testid="transfer-sent-items-empty"
                  className="mt-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600"
                >
                  Transfer ini belum punya item.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="pb-2 font-semibold text-neutral-700">
                          SKU
                        </th>
                        <th className="pb-2 font-semibold text-neutral-700">
                          Jumlah
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((item) => (
                        <tr
                          key={item.id}
                          data-testid="transfer-sent-item-row"
                          className="border-b border-neutral-100"
                        >
                          <td className="py-2 font-mono text-neutral-900">
                            {getSkuLabel(item.variantId)}
                          </td>
                          <td className="py-2 text-neutral-800">
                            {item.sentQty > 0
                              ? item.sentQty
                              : item.requestedQty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canWrite &&
              selectedTransfer &&
              canReceiveSent(role ?? 'staff', selectedTransfer.status) ? (
                <div className="mt-4 border-t border-neutral-100 pt-4">
                  {receiveError ? (
                    <p
                      role="alert"
                      data-testid="transfer-receive-error"
                      className="mb-2 text-sm text-error-500"
                    >
                      {receiveError}
                    </p>
                  ) : null}
                  <p className="mb-3 text-sm text-neutral-600">
                    Terima seluruh item transfer ini di gudang tujuan.
                  </p>
                  <button
                    type="button"
                    data-testid="transfer-receive-button"
                    onClick={(e) => void onReceive(e)}
                    disabled={receiving}
                    className={primaryButtonClass}
                  >
                    {receiving ? 'Menerima…' : 'Terima transfer'}
                  </button>
                </div>
              ) : (
                <p
                  data-testid="transfer-receive-readonly"
                  className="mt-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
                >
                  Hanya Manager/Admin yang dapat menerima transfer dikirim.
                </p>
              )}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

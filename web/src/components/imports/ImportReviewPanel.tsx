'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ImportsClientError,
  confirmImport,
  formatIdr,
  getImport,
  listImports,
  parseRowsJson,
  patchImportBatch,
  patchImportRow,
  uploadImportCsv,
  uploadImportRows,
  type ConfirmSummary,
  type ImportBatchView,
} from '@/lib/imports-client';
import { getImportsCopy } from '@/lib/imports-copy';
import { getMyMembership, type MyMembershipView } from '@/lib/team-client';

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
 * Product import review panel (UTA-78, Story 02 web).
 *
 * Upload → review → confirm-before-create over the UTA-77 import APIs
 * (cookie session, `credentials: "same-origin"` — no tokens in JS or logs).
 * CSV text (or a picked .csv file read locally) posts as `content`;
 * xlsx/photo/PDF converters paste pre-parsed `rows` JSON instead — the
 * server never parses binary formats. Batch rows render with errors,
 * batch/catalog duplicates (`existingPath` shown as an opaque route), and
 * Store SKU text labeled everywhere as a mapping candidate only — it never
 * replaces the SKU TokoBoss identity.
 *
 * RBAC is chrome only: Manager/Admin see upload + edit + confirm controls;
 * Staff sees the read-only note; 401 `INVALID_SESSION` redirects to
 * `/sign-in?expired=1`; 403 renders the honest no-access card. No live
 * marketplace calls anywhere.
 */
export function ImportReviewPanel() {
  const copy = getImportsCopy('en');
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState('');
  const [loadedWorkspace, setLoadedWorkspace] = useState<string | null>(null);
  const [membership, setMembership] = useState<MyMembershipView | null>(null);
  const [batches, setBatches] = useState<ImportBatchView[]>([]);
  const [selected, setSelected] = useState<ImportBatchView | null>(null);
  const [summary, setSummary] = useState<ConfirmSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Upload form
  const [filename, setFilename] = useState('produk.csv');
  const [csv, setCsv] = useState('');
  const [rowsMode, setRowsMode] = useState(false);
  const [rowsJson, setRowsJson] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Row editing
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editNote, setEditNote] = useState('');
  const [savingRow, setSavingRow] = useState(false);
  const [rejectingRowId, setRejectingRowId] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const reauth = useCallback(() => {
    router.replace('/sign-in?expired=1');
  }, [router]);

  const handleClientError = useCallback(
    (err: unknown, set: (msg: string | null) => void): void => {
      if (err instanceof ImportsClientError && err.needsReauth) {
        reauth();
        return;
      }
      if (err instanceof ImportsClientError) {
        set(err.message);
        return;
      }
      set(copy.genericError);
    },
    [reauth, copy.genericError]
  );

  async function refreshBatches(ws: string) {
    setLoading(true);
    try {
      setBatches(await listImports(ws));
    } catch (err) {
      handleClientError(err, setError);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Silent list refresh after row edits: keeps the batch counters honest
   * without flashing the list loading state.
   */
  const refreshBatchesQuiet = useCallback(
    async (ws: string) => {
      try {
        setBatches(await listImports(ws));
      } catch (err) {
        handleClientError(err, setError);
      }
    },
    [handleClientError]
  );

  async function onLoad(e?: React.FormEvent) {
    e?.preventDefault();
    const ws = workspaceId.trim();
    if (!ws) {
      setError(copy.validationError);
      return;
    }
    setError(null);
    setNotice(null);
    setSelected(null);
    setSummary(null);
    try {
      setMembership(await getMyMembership());
    } catch {
      setMembership(null);
    }
    setLoadedWorkspace(ws);
    await refreshBatches(ws);
  }

  async function openBatch(batchId: string) {
    if (!loadedWorkspace) return;
    setLoadingBatch(true);
    setError(null);
    try {
      setSelected(await getImport(loadedWorkspace, batchId));
      setSummary(null);
    } catch (err) {
      handleClientError(err, setError);
    } finally {
      setLoadingBatch(false);
    }
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCsv(text.slice(0, 1_000_000));
    if (!filename.trim() || filename.trim() === 'produk.csv') {
      setFilename(file.name.slice(0, 200) || 'produk.csv');
    }
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!loadedWorkspace || uploading) return;
    setUploadError(null);
    setNotice(null);
    const name = filename.trim();
    if (!name) {
      setUploadError(copy.validationError);
      return;
    }
    setUploading(true);
    try {
      const result = rowsMode
        ? (() => {
            const parsed = parseRowsJson(rowsJson.trim());
            if (!parsed.ok) {
              throw new ImportsClientError({
                status: 400,
                errorCode: 'IMPORT_VALIDATION',
                message: copy.rowsJsonError,
              });
            }
            return uploadImportRows(loadedWorkspace, {
              filename: name,
              rows: parsed.rows,
            });
          })()
        : uploadImportCsv(loadedWorkspace, {
            filename: name,
            content: csv,
          });
      const done = await result;
      setNotice(
        done.duplicate ? copy.uploadDuplicateNotice : copy.uploadedNotice
      );
      await refreshBatches(loadedWorkspace);
      await openBatch(done.batch.id);
      setCsv('');
      setRowsJson('');
    } catch (err) {
      handleClientError(err, setUploadError);
    } finally {
      setUploading(false);
    }
  }

  function startEdit(
    rowId: string,
    name: string,
    sku: string,
    price: number,
    note: string | null
  ) {
    setEditingRowId(rowId);
    setEditName(name);
    setEditSku(sku);
    setEditPrice(String(price));
    setEditNote(note ?? '');
  }

  async function onSaveRow(rowId: string) {
    if (!loadedWorkspace || !selected) return;
    const price = Number.parseInt(editPrice.trim(), 10);
    if (
      !editName.trim() ||
      !editSku.trim() ||
      !/^\d+$/.test(editPrice.trim()) ||
      !Number.isSafeInteger(price)
    ) {
      setError(copy.validationError);
      return;
    }
    setSavingRow(true);
    setError(null);
    try {
      await patchImportRow(loadedWorkspace, selected.id, rowId, {
        productName: editName.trim(),
        skuCode: editSku.trim(),
        sellingPriceCents: price,
        note: editNote.trim() ? editNote.trim() : null,
      });
      // Re-read the batch detail so rows + counters reflect the server
      // re-validation (never splice local state over server truth).
      setSelected(await getImport(loadedWorkspace, selected.id));
      await refreshBatchesQuiet(loadedWorkspace);
      setEditingRowId(null);
      setNotice(copy.rowSavedNotice);
    } catch (err) {
      handleClientError(err, setError);
    } finally {
      setSavingRow(false);
    }
  }

  async function onRejectRow(rowId: string) {
    if (!loadedWorkspace || !selected) return;
    setRejectingRowId(rowId);
    setError(null);
    try {
      await patchImportRow(loadedWorkspace, selected.id, rowId, {
        status: 'rejected',
      });
      // Re-read the batch detail so rows + counters stay honest.
      setSelected(await getImport(loadedWorkspace, selected.id));
      await refreshBatchesQuiet(loadedWorkspace);
      setNotice(copy.rowRejectedNotice);
    } catch (err) {
      handleClientError(err, setError);
    } finally {
      setRejectingRowId(null);
    }
  }

  async function onConfirm() {
    if (!loadedWorkspace || !selected || confirming) return;
    if (!window.confirm(copy.batchConfirmPrompt)) return;
    setConfirming(true);
    setError(null);
    try {
      const result = await confirmImport(loadedWorkspace, selected.id);
      setSummary(result.summary);
      // The confirm response carries the batch without rows — always
      // re-read the detail so the table shows post-confirm row states.
      setSelected(await getImport(loadedWorkspace, selected.id));
      setNotice(copy.confirmedNotice);
      await refreshBatches(loadedWorkspace);
    } catch (err) {
      handleClientError(err, setError);
    } finally {
      setConfirming(false);
    }
  }

  async function onBatchAction(action: 'reject' | 'reopen') {
    if (!loadedWorkspace || !selected || batchBusy) return;
    if (action === 'reject' && !window.confirm(copy.batchRejectPrompt)) return;
    setBatchBusy(true);
    setError(null);
    try {
      const updated = await patchImportBatch(
        loadedWorkspace,
        selected.id,
        action
      );
      const detail = await getImport(loadedWorkspace, selected.id).catch(
        () => updated
      );
      setSelected(detail);
      setNotice(
        action === 'reject' ? copy.batchRejectedNotice : copy.batchReopenedNotice
      );
      await refreshBatches(loadedWorkspace);
    } catch (err) {
      handleClientError(err, setError);
    } finally {
      setBatchBusy(false);
    }
  }

  const role = membership?.role ?? null;
  const canWrite = role === null || role === 'admin' || role === 'manager';
  const rows = selected?.rows ?? [];

  return (
    <div data-testid="import-review-panel">
      <form
        data-testid="workspace-form"
        onSubmit={(e) => void onLoad(e)}
        className="rounded-2xl border border-neutral-200 bg-white p-4"
      >
        <label htmlFor="imports-workspace" className={labelClass}>
          {copy.workspaceLabel}
        </label>
        <div className="flex gap-2">
          <input
            id="imports-workspace"
            data-testid="imports-workspace"
            className={`${inputClass} font-mono`}
            placeholder={copy.workspacePlaceholder}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          />
          <button
            type="submit"
            data-testid="imports-load"
            disabled={loading}
            className={primaryButtonClass}
          >
            {loading ? copy.loading : copy.loadButton}
          </button>
        </div>
      </form>

      {error ? (
        <p
          role="alert"
          data-testid="imports-error"
          className="mt-4 rounded-lg border border-error-500 bg-error-500/10 px-4 py-3 text-sm text-neutral-900"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          data-testid="imports-notice"
          className="mt-4 rounded-lg border border-success-500 bg-success-500/10 px-4 py-3 text-sm text-neutral-900"
        >
          {notice}
        </p>
      ) : null}

      {loadedWorkspace ? (
        <>
          {role === 'staff' ? (
            <p
              data-testid="imports-readonly-note"
              className="mt-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
            >
              {copy.readOnlyNote}
            </p>
          ) : null}

          {canWrite ? (
            <form
              data-testid="import-upload-form"
              onSubmit={(e) => void onUpload(e)}
              className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <h2 className="text-lg font-semibold text-neutral-900">
                {copy.uploadTitle}
              </h2>
              <p className="text-sm text-neutral-600">{copy.uploadSubtitle}</p>
              {uploadError ? (
                <p
                  role="alert"
                  data-testid="import-upload-error"
                  className="mt-2 text-sm text-error-500"
                >
                  {uploadError}
                </p>
              ) : null}
              <div className="mt-3 grid gap-3">
                <div>
                  <label htmlFor="import-filename" className={labelClass}>
                    {copy.filenameLabel}
                  </label>
                  <input
                    id="import-filename"
                    data-testid="import-filename"
                    className={inputClass}
                    placeholder={copy.filenamePlaceholder}
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                  />
                </div>
                {rowsMode ? (
                  <div>
                    <label htmlFor="import-rows-json" className={labelClass}>
                      {copy.rowsJsonLabel}
                    </label>
                    <textarea
                      id="import-rows-json"
                      data-testid="import-rows-json"
                      className={`${inputClass} min-h-[120px] font-mono text-sm`}
                      placeholder={copy.rowsJsonPlaceholder}
                      value={rowsJson}
                      onChange={(e) => setRowsJson(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      {copy.rowsJsonHint}
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="import-csv" className={labelClass}>
                        {copy.csvLabel}
                      </label>
                      <textarea
                        id="import-csv"
                        data-testid="import-csv"
                        className={`${inputClass} min-h-[120px] font-mono text-sm`}
                        placeholder={copy.csvPlaceholder}
                        value={csv}
                        onChange={(e) => setCsv(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        {copy.csvHint}
                      </p>
                    </div>
                    <div>
                      <label htmlFor="import-file" className={labelClass}>
                        {copy.fileLabel}
                      </label>
                      <input
                        id="import-file"
                        data-testid="import-file"
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        className="block text-sm text-neutral-700"
                        onChange={(e) =>
                          void onPickFile(e.target.files?.[0])
                        }
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        {copy.fileHint}
                      </p>
                    </div>
                  </>
                )}
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    data-testid="import-rows-mode"
                    checked={rowsMode}
                    onChange={(e) => setRowsMode(e.target.checked)}
                  />
                  {copy.rowsModeLabel}
                </label>
              </div>
              <div className="mt-3">
                <button
                  type="submit"
                  data-testid="import-upload"
                  disabled={uploading}
                  className={primaryButtonClass}
                >
                  {uploading ? copy.uploading : copy.uploadButton}
                </button>
              </div>
            </form>
          ) : null}

          <section aria-labelledby="batches-title" className="mt-4">
            <h2
              id="batches-title"
              className="text-lg font-semibold text-neutral-900"
            >
              {copy.batchesTitle} ({batches.length})
            </h2>
            {loading ? (
              <p className="mt-2 text-sm text-neutral-500">
                {copy.loadingBatches}
              </p>
            ) : batches.length === 0 ? (
              <div
                data-testid="imports-empty"
                className="mt-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center"
              >
                <p className="text-sm text-neutral-600">{copy.batchesEmpty}</p>
              </div>
            ) : (
              <ul data-testid="imports-list" className="mt-2 grid gap-3">
                {batches.map((b) => (
                  <li
                    key={b.id}
                    data-testid="import-batch-row"
                    data-batch-id={b.id}
                    className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-neutral-900">
                          {b.sourceFilename}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {copy.batchStatusLabel}: {b.status} ·{' '}
                          {b.readyRows}/{b.totalRows} {copy.batchCountersHint} ·{' '}
                          {b.appliedRows} · {b.rejectedRows}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="import-batch-open"
                        disabled={loadingBatch}
                        onClick={() => void openBatch(b.id)}
                        className={secondaryButtonClass}
                      >
                        {copy.batchOpen}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selected ? (
            <section
              aria-labelledby="review-rows-title"
              className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <h2
                id="review-rows-title"
                className="text-lg font-semibold text-neutral-900"
              >
                {copy.rowTableTitle} — {selected.sourceFilename} ({selected.status})
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                {copy.identityFreezeNote} {copy.noLiveChannelNote}
              </p>
              {rows.length === 0 ? (
                <p
                  data-testid="import-rows-empty"
                  className="mt-2 text-sm text-neutral-600"
                >
                  {copy.batchesEmpty}
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table
                    data-testid="import-rows-table"
                    className="w-full min-w-[720px] text-left text-sm"
                  >
                    <thead>
                      <tr className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                        <th className="px-2 py-2">{copy.rowNumberLabel}</th>
                        <th className="px-2 py-2">{copy.rowProductLabel}</th>
                        <th className="px-2 py-2">{copy.rowSkuLabel}</th>
                        <th className="px-2 py-2">{copy.rowStoreSkuLabel}</th>
                        <th className="px-2 py-2">{copy.rowPriceLabel}</th>
                        <th className="px-2 py-2">{copy.rowStatusLabel}</th>
                        <th className="px-2 py-2">{copy.rowActionsLabel}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          data-testid="import-row"
                          data-row-id={row.id}
                          className="border-b border-neutral-100 align-top"
                        >
                          <td className="px-2 py-3 font-mono">{row.rowNumber}</td>
                          <td className="px-2 py-3">
                            {editingRowId === row.id ? (
                              <input
                                aria-label={copy.editNameLabel}
                                data-testid="row-edit-name"
                                className={inputClass}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                            ) : (
                              <>
                                <p className="font-semibold text-neutral-900">
                                  {row.productName || '—'}
                                </p>
                                <p className="text-xs text-neutral-500">
                                  {row.variantName ?? '—'}
                                </p>
                              </>
                            )}
                            {row.errors.length > 0 ? (
                              <p
                                data-testid="row-errors"
                                className="mt-1 text-xs text-error-500"
                              >
                                {copy.rowErrorsLabel}: {row.errors.join('; ')}
                              </p>
                            ) : null}
                            {row.duplicateOf ? (
                              <p
                                data-testid="row-duplicate"
                                className="mt-1 font-mono text-xs text-neutral-700"
                              >
                                {copy.rowDuplicateLabel}:{' '}
                                {row.duplicateOf.existingPath} (
                                {row.duplicateOf.source})
                              </p>
                            ) : null}
                            {row.applied ? (
                              <p
                                data-testid="row-applied"
                                className="mt-1 text-xs text-success-500"
                              >
                                {copy.rowAppliedLabel}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-3">
                            {editingRowId === row.id ? (
                              <input
                                aria-label={copy.editSkuLabel}
                                data-testid="row-edit-sku"
                                className={`${inputClass} font-mono`}
                                value={editSku}
                                onChange={(e) => setEditSku(e.target.value)}
                              />
                            ) : (
                              <p
                                data-testid="row-sku"
                                className="font-mono text-sm font-bold text-primary-800"
                              >
                                {row.skuCode}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <p
                              data-testid="row-store-sku"
                              className="font-mono text-xs text-neutral-600"
                              title={copy.rowStoreSkuHint}
                            >
                              {row.sellerSkuHint ??
                                row.platformSkuId ??
                                '—'}
                            </p>
                            <p className="text-[11px] text-neutral-400">
                              {copy.rowStoreSkuHint}
                            </p>
                          </td>
                          <td className="px-2 py-3">
                            {editingRowId === row.id ? (
                              <input
                                aria-label={copy.editPriceLabel}
                                data-testid="row-edit-price"
                                className={inputClass}
                                inputMode="numeric"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value)}
                              />
                            ) : (
                              <p className="font-mono">
                                {formatIdr(row.sellingPriceCents)}
                              </p>
                            )}
                            {editingRowId === row.id ? (
                              <input
                                aria-label={copy.editNoteLabel}
                                data-testid="row-edit-note"
                                className={`${inputClass} mt-2`}
                                placeholder={copy.editNotePlaceholder}
                                value={editNote}
                                onChange={(e) => setEditNote(e.target.value)}
                              />
                            ) : null}
                          </td>
                          <td className="px-2 py-3">
                            <p data-testid="row-status">{row.status}</p>
                          </td>
                          <td className="px-2 py-3">
                            {canWrite ? (
                              editingRowId === row.id ? (
                                <div className="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    data-testid="row-save"
                                    disabled={savingRow}
                                    onClick={() => void onSaveRow(row.id)}
                                    className={secondaryButtonClass}
                                  >
                                    {savingRow ? copy.rowSaving : copy.rowSaveButton}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid="row-cancel"
                                    onClick={() => setEditingRowId(null)}
                                    className={secondaryButtonClass}
                                  >
                                    {copy.rowCancelButton}
                                  </button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    data-testid="row-edit"
                                    onClick={() =>
                                      startEdit(
                                        row.id,
                                        row.productName,
                                        row.skuCode,
                                        row.sellingPriceCents,
                                        row.note
                                      )
                                    }
                                    className={secondaryButtonClass}
                                  >
                                    {copy.rowEditButton}
                                  </button>
                                  <button
                                    type="button"
                                    data-testid="row-reject"
                                    disabled={rejectingRowId === row.id}
                                    onClick={() => void onRejectRow(row.id)}
                                    className={secondaryButtonClass}
                                  >
                                    {rejectingRowId === row.id
                                      ? copy.rowRejecting
                                      : copy.rowRejectButton}
                                  </button>
                                </div>
                              )
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canWrite ? (
                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <h3 className="font-semibold text-neutral-900">
                    {copy.confirmTitle}
                  </h3>
                  <p className="text-sm text-neutral-600">
                    {copy.confirmSubtitle}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="import-confirm"
                      disabled={confirming}
                      onClick={() => void onConfirm()}
                      className={primaryButtonClass}
                    >
                      {confirming ? copy.confirming : copy.confirmButton}
                    </button>
                    {selected.status === 'rejected' ? (
                      <button
                        type="button"
                        data-testid="import-reopen"
                        disabled={batchBusy}
                        onClick={() => void onBatchAction('reopen')}
                        className={secondaryButtonClass}
                      >
                        {batchBusy ? copy.reopeningBatch : copy.reopenBatchButton}
                      </button>
                    ) : (
                      <button
                        type="button"
                        data-testid="import-reject-batch"
                        disabled={batchBusy}
                        onClick={() => void onBatchAction('reject')}
                        className={secondaryButtonClass}
                      >
                        {batchBusy ? copy.rejectingBatch : copy.rejectBatchButton}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {summary ? (
                <div data-testid="import-summary" className="mt-4 grid gap-3">
                  <p
                    data-testid="import-summary-applied"
                    className="rounded-lg border border-success-500 bg-success-500/10 px-4 py-3 text-sm"
                  >
                    Applied: {summary.applied.length}
                  </p>
                  {summary.duplicates.length > 0 ? (
                    <div className="rounded-lg border border-neutral-300 bg-white px-4 py-3">
                      <p className="text-sm font-semibold">
                        {copy.confirmDuplicatesTitle} ({summary.duplicates.length})
                      </p>
                      <ul className="mt-2 grid gap-1">
                        {summary.duplicates.map((d) => (
                          <li
                            key={d.rowId}
                            data-testid="import-summary-duplicate"
                            className="font-mono text-xs text-neutral-700"
                          >
                            {d.skuCode} → {d.existingPath}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {summary.skipped.length > 0 ? (
                    <div className="rounded-lg border border-neutral-300 bg-white px-4 py-3">
                      <p className="text-sm font-semibold">
                        {copy.confirmSkippedTitle} ({summary.skipped.length})
                      </p>
                      <ul className="mt-2 grid gap-1">
                        {summary.skipped.map((s) => (
                          <li
                            key={s.rowId}
                            data-testid="import-summary-skipped"
                            className="font-mono text-xs text-neutral-700"
                          >
                            {s.rowId}: {s.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

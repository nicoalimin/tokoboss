'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BundleClientError,
  archiveBundle,
  createBundle,
  getBundle,
  listBundles,
  updateBundle,
  type BundleComponentInput,
  type BundleComponentWire,
  type BundleWire,
} from '@/lib/bundles-client';
import { getBundlesCopy } from '@/lib/bundles-copy';
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

interface LineDraft {
  componentVariantId: string;
  qty: string;
}

function emptyLine(): LineDraft {
  return { componentVariantId: '', qty: '' };
}

function toInputs(lines: LineDraft[]): BundleComponentInput[] | null {
  const out: BundleComponentInput[] = [];
  for (const line of lines) {
    const id = line.componentVariantId.trim();
    const qty = Number.parseInt(line.qty.trim(), 10);
    if (
      !id ||
      !/^\d+$/.test(line.qty.trim()) ||
      !Number.isSafeInteger(qty) ||
      qty <= 0
    ) {
      return null;
    }
    out.push({ componentVariantId: id, qty });
  }
  return out.length > 0 ? out : null;
}

interface BundlesPanelProps {
  initialWorkspaceId?: string;
  initialBundleVariantId?: string;
}

/**
 * Bundles/BOM panel (UTA-80, Story 13 web).
 *
 * Honest BOM editor over the UTA-79 APIs (cookie session,
 * `credentials: "same-origin"` — no tokens in JS or logs). Lists bundle
 * shells, opens one BOM detail (component SKU TokoBoss + qty per line plus
 * derived per-warehouse availability when the API returns it), creates /
 * replaces / archives BOM lines. Archive clears lines (idempotent); there
 * is no hard delete anywhere.
 *
 * Cycle / self-reference (`BUNDLE_CYCLE`), duplicate BOM
 * (`BUNDLE_CONFLICT`), stale versions (`BUNDLE_VERSION_CONFLICT`), and
 * bundle-stock (`BUNDLE_NO_DIRECT_STOCK`) errors surface the API's honest
 * sentences — nothing is invented beyond the overview.
 *
 * RBAC is chrome only: Manager/Admin see create + edit + archive;
 * Staff sees the read-only note; 401 `INVALID_SESSION` redirects to
 * `/sign-in?expired=1`; 403 renders the honest no-access card.
 */
export function BundlesPanel({
  initialWorkspaceId = '',
  initialBundleVariantId = '',
}: BundlesPanelProps) {
  const copy = getBundlesCopy('en');
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [loadedWorkspace, setLoadedWorkspace] = useState<string | null>(null);
  const [membership, setMembership] = useState<MyMembershipView | null>(null);
  const [bundles, setBundles] = useState<BundleWire[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BundleWire | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Create form
  const [newBundleId, setNewBundleId] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [newLines, setNewLines] = useState<LineDraft[]>([emptyLine()]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit form (mirrors the open detail)
  const [editLines, setEditLines] = useState<LineDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const reauth = useCallback(() => {
    router.replace('/sign-in?expired=1');
  }, [router]);

  const handleClientError = useCallback(
    (err: unknown, set: (msg: string | null) => void): boolean => {
      if (err instanceof BundleClientError && err.needsReauth) {
        reauth();
        return true;
      }
      if (err instanceof BundleClientError) {
        set(err.message);
        return true;
      }
      set(copy.genericError);
      return true;
    },
    [reauth, copy.genericError]
  );

  const loadList = useCallback(
    async (ws: string) => {
      setLoading(true);
      setError(null);
      try {
        setBundles(await listBundles(ws));
      } catch (err) {
        handleClientError(err, setError);
      } finally {
        setLoading(false);
      }
    },
    [handleClientError]
  );

  const loadDetail = useCallback(
    async (ws: string, bundleVariantId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const found = await getBundle(ws, bundleVariantId);
        setDetail(found);
        setEditLines(
          found.components.map((c) => ({
            componentVariantId: c.line.componentVariantId,
            qty: String(c.line.qty),
          }))
        );
        setEditError(null);
      } catch (err) {
        setDetail(null);
        handleClientError(err, setDetailError);
      } finally {
        setDetailLoading(false);
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
    setNotice(null);
    setSelectedId(null);
    setDetail(null);
    try {
      setMembership(await getMyMembership());
    } catch {
      setMembership(null);
    }
    if (ws === loadedWorkspace) {
      await loadList(ws);
    } else {
      setLoadedWorkspace(ws);
    }
  }

  // Fresh-workspace loads + deep-link (?workspaceId=&bundleVariantId=).
  useEffect(() => {
    if (!loadedWorkspace) {
      if (initialWorkspaceId.trim()) {
        setWorkspaceId(initialWorkspaceId);
        setLoadedWorkspace(initialWorkspaceId.trim());
        void (async () => {
          try {
            setMembership(await getMyMembership());
          } catch {
            setMembership(null);
          }
        })();
      }
      return;
    }
    void loadList(loadedWorkspace);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedWorkspace]);

  // Deep-linked bundle selection loads once the list is in.
  useEffect(() => {
    if (!loadedWorkspace || !initialBundleVariantId.trim() || selectedId)
      return;
    const target = initialBundleVariantId.trim();
    setSelectedId(target);
    void loadDetail(loadedWorkspace, target);
  }, [loadedWorkspace, initialBundleVariantId, selectedId, loadDetail]);

  async function onOpen(bundleVariantId: string) {
    if (!loadedWorkspace) return;
    // Toggle: clicking the open bundle collapses the detail instead of
    // re-fetching it (the button label already reads "Close BOM").
    if (selectedId === bundleVariantId) {
      setSelectedId(null);
      setDetail(null);
      setDetailError(null);
      return;
    }
    setSelectedId(bundleVariantId);
    setNotice(null);
    // Clear the previous BOM so its lines don't flash under loading.
    setDetail(null);
    setDetailError(null);
    await loadDetail(loadedWorkspace, bundleVariantId);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!loadedWorkspace) return;
    setCreateError(null);
    setNotice(null);
    const bundleVariantId = newBundleId.trim();
    const expectedVersion = Number.parseInt(newVersion.trim(), 10);
    const components = toInputs(newLines);
    if (
      !bundleVariantId ||
      !/^\d+$/.test(newVersion.trim()) ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion <= 0 ||
      !components
    ) {
      setCreateError(copy.validationError);
      return;
    }
    setCreating(true);
    try {
      const created = await createBundle(loadedWorkspace, {
        bundleVariantId,
        components,
        expectedVersion,
      });
      setBundles((prev) =>
        prev.some((b) => b.bundleVariantId === created.bundleVariantId)
          ? prev.map((b) =>
              b.bundleVariantId === created.bundleVariantId ? created : b
            )
          : [created, ...prev]
      );
      setNewBundleId('');
      setNewVersion('');
      setNewLines([emptyLine()]);
      setNotice(copy.createdNotice);
    } catch (err) {
      if (err instanceof BundleClientError && err.needsReauth) {
        reauth();
        return;
      }
      if (err instanceof BundleClientError) setCreateError(err.message);
      else setCreateError(copy.genericError);
    } finally {
      setCreating(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!loadedWorkspace || !detail) return;
    setEditError(null);
    setNotice(null);
    const components = toInputs(editLines);
    if (!components) {
      setEditError(copy.validationError);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateBundle(
        loadedWorkspace,
        detail.bundleVariantId,
        {
          components,
          expectedVersion: detail.version,
        }
      );
      setDetail(updated);
      setEditLines(
        updated.components.map((c: BundleComponentWire) => ({
          componentVariantId: c.line.componentVariantId,
          qty: String(c.line.qty),
        }))
      );
      setBundles((prev) =>
        prev.map((b) =>
          b.bundleVariantId === updated.bundleVariantId ? updated : b
        )
      );
      setNotice(copy.savedNotice);
    } catch (err) {
      if (err instanceof BundleClientError && err.needsReauth) {
        reauth();
        return;
      }
      if (err instanceof BundleClientError) setEditError(err.message);
      else setEditError(copy.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function onArchive() {
    if (!loadedWorkspace || !detail) return;
    if (!window.confirm(copy.archiveConfirm)) return;
    setEditError(null);
    setNotice(null);
    setArchiving(true);
    try {
      const archived = await archiveBundle(
        loadedWorkspace,
        detail.bundleVariantId,
        { expectedVersion: detail.version }
      );
      setDetail(archived);
      setEditLines([]);
      setBundles((prev) =>
        prev.map((b) =>
          b.bundleVariantId === archived.bundleVariantId ? archived : b
        )
      );
      setNotice(copy.archivedNotice);
    } catch (err) {
      if (err instanceof BundleClientError && err.needsReauth) {
        reauth();
        return;
      }
      if (err instanceof BundleClientError) setEditError(err.message);
      else setEditError(copy.genericError);
    } finally {
      setArchiving(false);
    }
  }

  const role = membership?.role ?? null;
  const canWrite = role === null || role === 'admin' || role === 'manager';

  function renderLinesEditor(
    lines: LineDraft[],
    setLines: (next: LineDraft[]) => void,
    prefix: string
  ) {
    return (
      <ul data-testid={`${prefix}-lines`} className="grid gap-2">
        {lines.map((line, i) => (
          <li
            key={`${prefix}-line-${i}`}
            data-testid={`${prefix}-line-row`}
            className="grid gap-2 sm:grid-cols-[1fr_120px_auto]"
          >
            <div>
              <label
                htmlFor={`${prefix}-component-${i}`}
                className={labelClass}
              >
                {copy.componentVariantIdLabel} #{i + 1}
              </label>
              <input
                id={`${prefix}-component-${i}`}
                data-testid={`${prefix}-component-${i}`}
                className={`${inputClass} font-mono`}
                placeholder="var_…"
                value={line.componentVariantId}
                onChange={(e) =>
                  setLines(
                    lines.map((l, j) =>
                      j === i ? { ...l, componentVariantId: e.target.value } : l
                    )
                  )
                }
              />
            </div>
            <div>
              <label htmlFor={`${prefix}-qty-${i}`} className={labelClass}>
                {copy.qtyLabel}
              </label>
              <input
                id={`${prefix}-qty-${i}`}
                data-testid={`${prefix}-qty-${i}`}
                className={inputClass}
                inputMode="numeric"
                placeholder="2"
                value={line.qty}
                onChange={(e) =>
                  setLines(
                    lines.map((l, j) =>
                      j === i ? { ...l, qty: e.target.value } : l
                    )
                  )
                }
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                data-testid={`${prefix}-remove-${i}`}
                disabled={lines.length <= 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
                className={secondaryButtonClass}
              >
                {copy.removeLineButton}
              </button>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div data-testid="bundles-panel">
      <form
        data-testid="bundles-workspace-form"
        onSubmit={(e) => void onLoad(e)}
        className="rounded-2xl border border-neutral-200 bg-white p-4"
      >
        <label htmlFor="bundles-workspace" className={labelClass}>
          {copy.workspaceLabel}
        </label>
        <div className="flex gap-2">
          <input
            id="bundles-workspace"
            data-testid="bundles-workspace"
            className={`${inputClass} font-mono`}
            placeholder={copy.workspacePlaceholder}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          />
          <button
            type="submit"
            data-testid="bundles-load"
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
          data-testid="bundles-error"
          className="mt-4 rounded-lg border border-error-500 bg-error-500/10 px-4 py-3 text-sm text-neutral-900"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          data-testid="bundles-notice"
          className="mt-4 rounded-lg border border-success-500 bg-success-500/10 px-4 py-3 text-sm text-neutral-900"
        >
          {notice}
        </p>
      ) : null}

      {loadedWorkspace ? (
        <>
          {role === 'staff' ? (
            <p
              data-testid="bundles-readonly-note"
              className="mt-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
            >
              {copy.readOnlyNote}
            </p>
          ) : null}

          <section aria-labelledby="bundles-list-title" className="mt-4">
            <h2
              id="bundles-list-title"
              className="text-lg font-semibold text-neutral-900"
            >
              {copy.listTitle} ({bundles.length})
            </h2>
            {bundles.length === 0 && !loading ? (
              <div
                data-testid="bundles-empty"
                className="mt-2 rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center"
              >
                <p className="font-semibold text-neutral-900">
                  {copy.emptyTitle}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {copy.emptyBody}
                </p>
              </div>
            ) : (
              <ul data-testid="bundles-list" className="mt-2 grid gap-3">
                {bundles.map((b) => (
                  <li
                    key={b.bundleVariantId}
                    data-testid="bundle-row"
                    data-bundle-id={b.bundleVariantId}
                    className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                          {copy.bundleLabel}
                        </p>
                        <p
                          data-testid="bundle-sku"
                          className="font-mono text-base font-bold text-primary-800"
                        >
                          {b.skuCode}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {copy.componentsLabel}: {b.components.length} ·{' '}
                          {copy.versionLabel}: {b.version}
                        </p>
                      </div>
                      <button
                        type="button"
                        data-testid="bundle-open"
                        onClick={() => void onOpen(b.bundleVariantId)}
                        className={secondaryButtonClass}
                      >
                        {selectedId === b.bundleVariantId
                          ? copy.closeDetail
                          : copy.openDetail}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {selectedId ? (
            <section
              aria-labelledby="bundle-detail-title"
              data-testid="bundle-detail"
              className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <h2
                id="bundle-detail-title"
                className="text-lg font-semibold text-neutral-900"
              >
                {copy.detailTitle}
              </h2>
              {detailLoading ? (
                <p className="mt-2 text-sm text-neutral-500">{copy.loading}</p>
              ) : detailError ? (
                <p
                  role="alert"
                  data-testid="bundle-detail-error"
                  className="mt-2 text-sm text-error-500"
                >
                  {detailError}
                </p>
              ) : detail ? (
                <>
                  <p className="mt-1 font-mono text-sm font-bold text-neutral-900">
                    {detail.skuCode} · {copy.versionLabel} {detail.version}
                  </p>
                  <h3 className="mt-3 text-sm font-semibold text-neutral-900">
                    {copy.componentsLabel} ({detail.components.length})
                  </h3>
                  {detail.components.length === 0 ? (
                    <p
                      data-testid="bundle-components-empty"
                      className="mt-1 text-sm text-neutral-500"
                    >
                      {copy.archivedNotice}
                    </p>
                  ) : (
                    <ul
                      data-testid="bundle-components"
                      className="mt-1 divide-y divide-neutral-100"
                    >
                      {detail.components.map((c) => (
                        <li
                          key={c.line.id}
                          data-testid="bundle-component-row"
                          className="flex items-center justify-between gap-4 py-2 text-sm"
                        >
                          <span className="font-mono font-semibold text-neutral-900">
                            {c.componentSkuCode}
                          </span>
                          <span className="font-mono text-neutral-700">
                            ×{c.line.qty}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <h3 className="mt-3 text-sm font-semibold text-neutral-900">
                    {copy.availabilityLabel}
                  </h3>
                  {detail.availability.length === 0 ? (
                    <p
                      data-testid="bundle-availability-empty"
                      className="mt-1 text-sm text-neutral-500"
                    >
                      —
                    </p>
                  ) : (
                    <dl
                      data-testid="bundle-availability"
                      className="mt-1 divide-y divide-neutral-100"
                    >
                      {detail.availability.map((a) => (
                        <div
                          key={a.warehouseId}
                          data-testid="bundle-availability-row"
                          className="flex items-center justify-between py-1 text-sm"
                        >
                          <dt className="font-mono text-neutral-600">
                            {a.warehouseId}
                          </dt>
                          <dd className="font-mono font-semibold text-neutral-900">
                            {a.available} {copy.availableSuffix}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {canWrite ? (
                    <form
                      data-testid="bundle-edit-form"
                      onSubmit={(e) => void onSave(e)}
                      className="mt-4 rounded-xl bg-neutral-50 p-3"
                    >
                      <h3 className="text-base font-semibold text-neutral-900">
                        {copy.editTitle}
                      </h3>
                      <p className="text-xs text-neutral-500">
                        {copy.editSubtitle}
                      </p>
                      {editError ? (
                        <p
                          role="alert"
                          data-testid="bundle-edit-error"
                          className="mt-2 text-sm text-error-500"
                        >
                          {editError}
                        </p>
                      ) : null}
                      <div className="mt-3">
                        {renderLinesEditor(
                          editLines,
                          setEditLines,
                          'bundle-edit'
                        )}
                        <div className="mt-2">
                          <button
                            type="button"
                            data-testid="bundle-edit-add"
                            disabled={editLines.length >= 100}
                            onClick={() =>
                              setEditLines([...editLines, emptyLine()])
                            }
                            className={secondaryButtonClass}
                          >
                            {copy.addLineButton}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="submit"
                          data-testid="bundle-save"
                          disabled={saving || editLines.length === 0}
                          className={primaryButtonClass}
                        >
                          {saving ? copy.saving : copy.saveButton}
                        </button>
                        <button
                          type="button"
                          data-testid="bundle-archive"
                          disabled={archiving}
                          onClick={() => void onArchive()}
                          className={secondaryButtonClass}
                        >
                          {archiving ? copy.archiving : copy.archiveButton}
                        </button>
                      </div>
                    </form>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-sm text-neutral-500">
                  {copy.noDetailHint}
                </p>
              )}
            </section>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">{copy.noDetailHint}</p>
          )}

          {canWrite ? (
            <form
              data-testid="bundle-create-form"
              onSubmit={(e) => void onCreate(e)}
              className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4"
            >
              <h2 className="text-lg font-semibold text-neutral-900">
                {copy.createTitle}
              </h2>
              <p className="text-sm text-neutral-600">{copy.createSubtitle}</p>
              {createError ? (
                <p
                  role="alert"
                  data-testid="bundle-create-error"
                  className="mt-2 text-sm text-error-500"
                >
                  {createError}
                </p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="bundle-create-id" className={labelClass}>
                    {copy.bundleVariantIdLabel}
                  </label>
                  <input
                    id="bundle-create-id"
                    data-testid="bundle-create-id"
                    className={`${inputClass} font-mono`}
                    placeholder="var_…"
                    value={newBundleId}
                    onChange={(e) => setNewBundleId(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    {copy.bundleVariantIdHint}
                  </p>
                </div>
                <div>
                  <label htmlFor="bundle-create-version" className={labelClass}>
                    {copy.expectedVersionLabel}
                  </label>
                  <input
                    id="bundle-create-version"
                    data-testid="bundle-create-version"
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="1"
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    {copy.expectedVersionHint}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                {renderLinesEditor(newLines, setNewLines, 'bundle-create')}
                <div className="mt-2">
                  <button
                    type="button"
                    data-testid="bundle-create-add"
                    disabled={newLines.length >= 100}
                    onClick={() => setNewLines([...newLines, emptyLine()])}
                    className={secondaryButtonClass}
                  >
                    {copy.addLineButton}
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="submit"
                  data-testid="bundle-create-submit"
                  disabled={creating}
                  className={primaryButtonClass}
                >
                  {creating ? copy.creating : copy.createButton}
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

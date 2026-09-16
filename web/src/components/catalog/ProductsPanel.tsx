'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CatalogClientError,
  archiveProduct,
  createProduct,
  formatIdr,
  listProducts,
  primarySku,
  productTotalQty,
  searchCatalog,
  type ProductView,
} from '@/lib/catalog-client';
import { getCatalogCopy } from '@/lib/catalog-copy';
import { getMyMembership, type MyMembershipView } from '@/lib/team-client';
import { SkuDrawer } from './SkuDrawer';

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
 * Produk & Stok panel (UTA-76, Story 01 web).
 *
 * Information-dense product list over the UTA-75 catalog APIs (cookie
 * session, `credentials: "same-origin"` — no tokens in JS or logs).
 * Search runs one query across name / SKU TokoBoss / barcode / Store SKU
 * hint / listing name via `GET .../catalog/search`; selecting a row opens
 * the `SkuDrawer` as a right-side overlay while the list stays mounted
 * (list context is never lost). Create requires ≥1 variant; archive is
 * confirm-gated and never a hard delete; duplicate SKUs surface the
 * conflict copy with the existing-product route reference (no raw ids).
 *
 * RBAC is chrome only: Manager/Admin see create + archive + drawer edit
 * controls; Staff sees the read-only note and keeps drawer adjustments
 * (server-scoped); 401 `INVALID_SESSION` redirects to
 * `/sign-in?expired=1`; 403 renders the honest no-access card.
 */
export function ProductsPanel() {
  const copy = getCatalogCopy('en');
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState('');
  const [loadedWorkspace, setLoadedWorkspace] = useState<string | null>(null);
  const [membership, setMembership] = useState<MyMembershipView | null>(null);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicatePath, setDuplicatePath] = useState<string | null>(null);
  const [drawerProductId, setDrawerProductId] = useState<string | null>(null);
  const [drawerVariantId, setDrawerVariantId] = useState<string | null>(null);

  // Create form
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('pcs');
  const [newSku, setNewSku] = useState('');
  const [newVariantName, setNewVariantName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const reauth = useCallback(() => {
    router.replace('/sign-in?expired=1');
  }, [router]);

  const handleClientError = useCallback(
    (err: unknown): void => {
      if (err instanceof CatalogClientError && err.needsReauth) {
        reauth();
        return;
      }
      if (err instanceof CatalogClientError) {
        setError(err.message);
        return;
      }
      setError(copy.genericError);
    },
    [reauth, copy.genericError]
  );

  /**
   * Reload the list for `ws`, honoring the current search text: empty
   * queries list everything, anything else re-runs the cross-identifier
   * search (variant-only hits lift their parent rows). Drawer saves reuse
   * this so an active filter survives edits.
   */
  const loadList = useCallback(
    async (ws: string, searchText: string) => {
      const needle = searchText.trim();
      if (!needle) {
        setLoading(true);
        setError(null);
        try {
          setProducts(await listProducts(ws));
        } catch (err) {
          handleClientError(err);
        } finally {
          setLoading(false);
        }
        return;
      }
      setSearching(true);
      try {
        const { products: found, variants } = await searchCatalog(ws, needle);
        if (found.length > 0) {
          setProducts(found);
        } else {
          const ids = new Set(variants.map((v) => v.productId));
          const all = await listProducts(ws);
          setProducts(all.filter((p) => ids.has(p.id)));
        }
        setError(null);
      } catch (err) {
        handleClientError(err);
      } finally {
        setSearching(false);
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
    setDuplicatePath(null);
    setDrawerProductId(null);
    // Membership is best-effort chrome: unknown → treat as reader until
    // the server answers (every deep call stays server-gated).
    try {
      setMembership(await getMyMembership());
    } catch {
      setMembership(null);
    }
    if (ws === loadedWorkspace) {
      // Same workspace re-loaded: the effect below won't refire, so load
      // explicitly (a fresh workspace loads through the effect — one fetch).
      await loadList(ws, query);
    } else {
      setLoadedWorkspace(ws);
    }
  }

  // Cross-identifier search (debounced); empty query falls back to list.
  // This effect owns every fresh-workspace load so workspace switches cost
  // exactly one fetch.
  useEffect(() => {
    if (!loadedWorkspace) return;
    const needle = query.trim();
    if (!needle) {
      void loadList(loadedWorkspace, '');
      return;
    }
    const timer = setTimeout(() => {
      void loadList(loadedWorkspace, needle);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, loadedWorkspace, loadList]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!loadedWorkspace) return;
    setCreateError(null);
    setNotice(null);
    setDuplicatePath(null);
    const name = newName.trim();
    const sku = newSku.trim();
    const price = Number.parseInt(newPrice.trim(), 10);
    if (
      !name ||
      !sku ||
      !/^\d+$/.test(newPrice.trim()) ||
      !Number.isSafeInteger(price)
    ) {
      setCreateError(copy.validationError);
      return;
    }
    setCreating(true);
    try {
      const created = await createProduct(loadedWorkspace, {
        name,
        unit: newUnit.trim() || 'pcs',
        variants: [
          {
            skuCode: sku,
            ...(newVariantName.trim() ? { name: newVariantName.trim() } : {}),
            sellingPriceCents: price,
          },
        ],
      });
      setProducts((prev) => [created, ...prev]);
      setNewName('');
      setNewSku('');
      setNewVariantName('');
      setNewPrice('');
      setNotice(copy.createdNotice);
    } catch (err) {
      if (err instanceof CatalogClientError && err.needsReauth) {
        reauth();
        return;
      }
      if (err instanceof CatalogClientError) {
        setCreateError(err.message);
        if (err.existingPath) setDuplicatePath(err.existingPath);
        return;
      }
      setCreateError(copy.genericError);
    } finally {
      setCreating(false);
    }
  }

  async function onArchive(product: ProductView) {
    if (!loadedWorkspace) return;
    if (!window.confirm(copy.archiveConfirm)) return;
    setArchivingId(product.id);
    setError(null);
    setNotice(null);
    try {
      const archived = await archiveProduct(loadedWorkspace, product.id);
      setProducts((prev) =>
        prev.map((p) => (p.id === archived.id ? archived : p))
      );
      setNotice(copy.archivedNotice);
    } catch (err) {
      handleClientError(err);
    } finally {
      setArchivingId(null);
    }
  }

  function openDrawer(product: ProductView, variantId?: string) {
    setDrawerProductId(product.id);
    setDrawerVariantId(variantId ?? product.variants?.[0]?.id ?? null);
  }

  const role = membership?.role ?? null;
  const canWrite = role === null || role === 'admin' || role === 'manager';

  return (
    <div data-testid="products-panel">
      <form
        data-testid="workspace-form"
        onSubmit={(e) => void onLoad(e)}
        className="rounded-2xl border border-neutral-200 bg-white p-4"
      >
        <label htmlFor="products-workspace" className={labelClass}>
          {copy.workspaceLabel}
        </label>
        <div className="flex gap-2">
          <input
            id="products-workspace"
            data-testid="products-workspace"
            className={`${inputClass} font-mono`}
            placeholder={copy.workspacePlaceholder}
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          />
          <button
            type="submit"
            data-testid="products-load"
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
          data-testid="products-error"
          className="mt-4 rounded-lg border border-error-500 bg-error-500/10 px-4 py-3 text-sm text-neutral-900"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          data-testid="products-notice"
          className="mt-4 rounded-lg border border-success-500 bg-success-500/10 px-4 py-3 text-sm text-neutral-900"
        >
          {notice}
        </p>
      ) : null}

      {loadedWorkspace ? (
        <>
          <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4">
            <label htmlFor="products-search" className={labelClass}>
              {copy.searchLabel}
            </label>
            <input
              id="products-search"
              data-testid="products-search"
              className={inputClass}
              placeholder={copy.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="mt-1 text-xs text-neutral-500">
              {searching ? copy.searching : copy.searchHint}
            </p>
          </div>

          {role === 'staff' ? (
            <p
              data-testid="products-readonly-note"
              className="mt-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
            >
              {copy.readOnlyNote}
            </p>
          ) : null}

          {loadedWorkspace ? (
            <p className="mt-4 text-sm">
              <Link
                href={`/produk/bundles?workspaceId=${encodeURIComponent(loadedWorkspace)}`}
                data-testid="products-bundles-link"
                className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
              >
                Manage bundles / BOM
              </Link>
            </p>
          ) : null}

          <section aria-labelledby="products-list-title" className="mt-4">
            <h2
              id="products-list-title"
              className="text-lg font-semibold text-neutral-900"
            >
              {copy.listTitle} ({products.length})
            </h2>
            {products.length === 0 && !loading ? (
              <div
                data-testid="products-empty"
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
              <ul data-testid="products-list" className="mt-2 grid gap-3">
                {products.map((p) => (
                  <li
                    key={p.id}
                    data-testid="product-row"
                    data-product-id={p.id}
                    className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-neutral-900">
                          {p.name}
                        </p>
                        <p
                          data-testid="product-primary-sku"
                          className="font-mono text-sm font-bold text-primary-800"
                        >
                          {primarySku(p)}
                          {(p.variants ?? []).length > 1
                            ? ` +${(p.variants ?? []).length - 1}`
                            : ''}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {(p.variants ?? [])
                            .map(
                              (v) =>
                                `${v.skuCode} · ${formatIdr(v.sellingPriceCents)}`
                            )
                            .join(' | ') || '—'}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-neutral-500">{copy.stockLabel}</p>
                        <p
                          data-testid="product-total-qty"
                          className="font-mono text-lg font-bold text-neutral-900"
                        >
                          {productTotalQty(p)}
                        </p>
                        <p className="text-neutral-500">
                          {p.status === 'archived'
                            ? copy.statusArchived
                            : copy.statusActive}{' '}
                          · {p.unit}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        data-testid="product-open"
                        onClick={() => openDrawer(p)}
                        className={secondaryButtonClass}
                      >
                        {copy.openDetail}
                      </button>
                      {canWrite && p.status !== 'archived' ? (
                        <button
                          type="button"
                          data-testid="product-archive"
                          disabled={archivingId === p.id}
                          onClick={() => void onArchive(p)}
                          className={secondaryButtonClass}
                        >
                          {archivingId === p.id
                            ? copy.archiving
                            : copy.archiveButton}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canWrite ? (
            <form
              data-testid="product-create-form"
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
                  data-testid="product-create-error"
                  className="mt-2 text-sm text-error-500"
                >
                  {createError}
                </p>
              ) : null}
              {duplicatePath ? (
                <p
                  data-testid="product-duplicate-path"
                  className="mt-2 font-mono text-xs text-neutral-700"
                >
                  {duplicatePath}
                </p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="create-name" className={labelClass}>
                    {copy.productNameLabel}
                  </label>
                  <input
                    id="create-name"
                    data-testid="create-name"
                    className={inputClass}
                    placeholder={copy.productNamePlaceholder}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="create-unit" className={labelClass}>
                    {copy.unitLabel}
                  </label>
                  <input
                    id="create-unit"
                    data-testid="create-unit"
                    className={inputClass}
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="create-sku" className={labelClass}>
                    {copy.variantSkuLabel}
                  </label>
                  <input
                    id="create-sku"
                    data-testid="create-sku"
                    className={`${inputClass} font-mono`}
                    placeholder={copy.variantSkuPlaceholder}
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="create-variant-name" className={labelClass}>
                    {copy.variantNameLabel}
                  </label>
                  <input
                    id="create-variant-name"
                    data-testid="create-variant-name"
                    className={inputClass}
                    placeholder={copy.variantNamePlaceholder}
                    value={newVariantName}
                    onChange={(e) => setNewVariantName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="create-price" className={labelClass}>
                    {copy.priceInputLabel}
                  </label>
                  <input
                    id="create-price"
                    data-testid="create-price"
                    className={inputClass}
                    inputMode="numeric"
                    placeholder="99000"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    {copy.priceInputHint}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="submit"
                  data-testid="create-submit"
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

      {drawerProductId && loadedWorkspace ? (
        <SkuDrawer
          workspaceId={loadedWorkspace}
          productId={drawerProductId}
          initialVariantId={drawerVariantId}
          role={role}
          onClose={() => {
            setDrawerProductId(null);
            setDrawerVariantId(null);
          }}
          onChanged={() => {
            if (loadedWorkspace) void loadList(loadedWorkspace, query);
          }}
        />
      ) : null}
    </div>
  );
}

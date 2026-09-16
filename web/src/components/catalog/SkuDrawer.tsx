'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CatalogClientError,
  adjustStock,
  formatIdr,
  getLedger,
  getProductDetail,
  getVariant,
  listWarehouses,
  updateProduct,
  updateVariant,
  type LedgerEntryView,
  type ProductView,
  type VariantView,
  type WarehouseView,
} from '@/lib/catalog-client';
import {
  BundleClientError,
  getBundle as getBundleDetail,
  type BundleWire,
} from '@/lib/bundles-client';
import { getCatalogCopy } from '@/lib/catalog-copy';

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

export type CatalogRole = 'admin' | 'manager' | 'staff' | null;

interface SkuDrawerProps {
  workspaceId: string;
  productId: string;
  initialVariantId?: string | null;
  role: CatalogRole;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * SKU drawer (UTA-76, Story 01 web).
 *
 * Right-side drawer over the still-open product list: the SKU TokoBoss
 * code is visually primary; editable details (name, price, unit,
 * HPP/cost-source, barcode, listing name, pictures) save through the
 * UTA-75 PATCH endpoints with optimistic concurrency (`expectedVersion`).
 * Store mappings render read-only from the detail payload (no live
 * channel calls). Per-warehouse quantities render from variant levels;
 * the adjustment form requires warehouse + non-zero delta + reason and
 * saves straight to the ledger (the server appends one entry and
 * advances the read model — no draft state).
 *
 * RBAC is chrome only: Manager/Admin see edit controls, Staff sees the
 * read-only note but keeps the adjustment form (the server scopes it).
 * SKU-code editing renders for Admins only; the server 422
 * (`CATALOG_SKU_LOCKED`) surfaces the locked note once a variant has
 * stock movements or mappings.
 */
export function SkuDrawer({
  workspaceId,
  productId,
  initialVariantId,
  role,
  onClose,
  onChanged,
}: SkuDrawerProps) {
  const copy = getCatalogCopy('en');
  const canEdit = role === 'admin' || role === 'manager';
  const canEditSku = role === 'admin';

  const [product, setProduct] = useState<ProductView | null>(null);
  const [variant, setVariant] = useState<VariantView | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [ledger, setLedger] = useState<LedgerEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Edit fields
  const [variantName, setVariantName] = useState('');
  const [priceIdr, setPriceIdr] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hppIdr, setHppIdr] = useState('');
  const [costSource, setCostSource] = useState('');
  const [listingName, setListingName] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [picturesText, setPicturesText] = useState('');
  const [unit, setUnit] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [skuLocked, setSkuLocked] = useState(false);

  // Adjustment fields
  const [adjWarehouse, setAdjWarehouse] = useState('');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);

  // Bundle BOM adjacency (UTA-80): best-effort read of this variant's BOM.
  const [bundle, setBundle] = useState<BundleWire | null>(null);
  const [bundleMissing, setBundleMissing] = useState(false);

  const selectedVariantId =
    variant?.id ?? initialVariantId ?? product?.variants?.[0]?.id ?? null;

  const syncVariantFields = useCallback((v: VariantView) => {
    setVariantName(v.name ?? '');
    setPriceIdr(String(v.sellingPriceCents));
    setBarcode(v.barcode ?? '');
    setHppIdr(
      v.hppCents === null || v.hppCents === undefined ? '' : String(v.hppCents)
    );
    setCostSource(v.costSource ?? '');
    setListingName(v.listingName ?? '');
    setSkuCode(v.skuCode);
  }, []);

  const load = useCallback(
    async (variantId: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const detail = await getProductDetail(workspaceId, productId);
        setProduct(detail);
        const target =
          (variantId
            ? detail.variants?.find((v) => v.id === variantId)
            : detail.variants?.[0]) ??
          detail.variants?.[0] ??
          null;
        if (target) {
          // Full variant payload carries levels + mappings.
          const full = await getVariant(workspaceId, target.id);
          setVariant(full);
          syncVariantFields(full);
          setLedger(await getLedger(workspaceId, full.id));
        }
        setPicturesText(
          (detail.pictures ?? []).map((p) => p.fileId).join(', ')
        );
        setUnit(detail.unit);
        const wh = await listWarehouses(workspaceId);
        setWarehouses(wh.filter((w) => w.status === 'active'));
        if (!adjWarehouse && wh.length > 0) {
          const first = wh.find((w) => w.status === 'active');
          if (first) setAdjWarehouse(first.id);
        }
      } catch (err) {
        if (err instanceof CatalogClientError && err.needsReauth) {
          setError(copy.expiredNotice);
        } else if (err instanceof CatalogClientError) {
          setError(err.message);
        } else {
          setError(copy.genericError);
        }
      } finally {
        setLoading(false);
      }
    },
    // adjWarehouse is set-once state; intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      workspaceId,
      productId,
      copy.expiredNotice,
      copy.genericError,
      syncVariantFields,
    ]
  );

  useEffect(() => {
    void load(initialVariantId ?? null);
  }, [load, initialVariantId]);

  // Adjacent BOM read: honest missing state, never blocks the drawer.
  useEffect(() => {
    const variantId = variant?.id;
    if (!variantId) return;
    let cancelled = false;
    setBundle(null);
    setBundleMissing(false);
    void (async () => {
      try {
        const found = await getBundleDetail(workspaceId, variantId);
        if (!cancelled) setBundle(found);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof BundleClientError && err.status === 404) {
          setBundleMissing(true);
        } else if (err instanceof BundleClientError && err.needsReauth) {
          // Session expired between the main drawer load and this
          // adjacent read — surface it like the main load does.
          setError(copy.expiredNotice);
        }
        // Other BOM failures stay silent here — the Bundles page
        // surfaces them honestly on open.
      }
    })();
    return () => {
      cancelled = true;
    };
    // copy.expiredNotice is a stable string; excluded to avoid refiring
    // on every render (same pattern as the adjWarehouse exclusion above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, variant?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onSelectVariant(variantId: string) {
    setNotice(null);
    setFormError(null);
    setSkuLocked(false);
    await load(variantId);
  }

  function parseRupiahToCents(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed === '') return null;
    if (!/^\d+$/.test(trimmed)) return NaN;
    return Number.parseInt(trimmed, 10);
  }

  async function onSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!variant || !canEdit) return;
    setFormError(null);
    setNotice(null);
    const price = parseRupiahToCents(priceIdr);
    const hpp = parseRupiahToCents(hppIdr);
    if (
      price === null ||
      Number.isNaN(price) ||
      (hpp !== null && Number.isNaN(hpp))
    ) {
      setFormError(copy.validationError);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateVariant(workspaceId, variant.id, {
        name: variantName.trim() === '' ? null : variantName.trim(),
        barcode: barcode.trim() === '' ? null : barcode.trim(),
        sellingPriceCents: price,
        hppCents: hpp,
        costSource: costSource.trim() === '' ? null : costSource.trim(),
        listingName: listingName.trim() === '' ? null : listingName.trim(),
        expectedVersion: variant.version,
      });
      setVariant(updated);
      syncVariantFields(updated);
      setNotice(copy.savedNotice);
      onChanged();
    } catch (err) {
      if (err instanceof CatalogClientError) setFormError(err.message);
      else setFormError(copy.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSkuCode(e: React.FormEvent) {
    e.preventDefault();
    if (!variant || !canEditSku) return;
    setFormError(null);
    setNotice(null);
    const next = skuCode.trim();
    if (!next || next === variant.skuCode) {
      setFormError(copy.validationError);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateVariant(workspaceId, variant.id, {
        skuCode: next,
        expectedVersion: variant.version,
      });
      setVariant(updated);
      syncVariantFields(updated);
      setSkuLocked(false);
      setNotice(copy.savedNotice);
      onChanged();
    } catch (err) {
      if (
        err instanceof CatalogClientError &&
        err.errorCode === 'CATALOG_SKU_LOCKED'
      ) {
        setSkuLocked(true);
      }
      if (err instanceof CatalogClientError) setFormError(err.message);
      else setFormError(copy.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function onSaveProductMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !canEdit) return;
    setFormError(null);
    setNotice(null);
    const nextUnit = unit.trim();
    if (!nextUnit) {
      setFormError(copy.validationError);
      return;
    }
    const fileIds = picturesText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (fileIds.some((id) => /^https?:\/\//.test(id))) {
      setFormError(copy.validationError);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateProduct(workspaceId, product.id, {
        unit: nextUnit,
        pictures: fileIds.map((fileId, i) => ({ fileId, sortOrder: i })),
        expectedVersion: product.version,
      });
      setProduct(updated);
      setPicturesText((updated.pictures ?? []).map((p) => p.fileId).join(', '));
      setUnit(updated.unit);
      setNotice(copy.savedNotice);
      onChanged();
    } catch (err) {
      if (err instanceof CatalogClientError) setFormError(err.message);
      else setFormError(copy.genericError);
    } finally {
      setSaving(false);
    }
  }

  async function onAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!variant) return;
    setAdjError(null);
    setNotice(null);
    const delta = Number.parseInt(adjDelta.trim(), 10);
    if (
      !adjWarehouse ||
      adjDelta.trim() === '' ||
      !Number.isInteger(delta) ||
      delta === 0 ||
      adjReason.trim() === ''
    ) {
      setAdjError(copy.reasonRequiredError);
      return;
    }
    setAdjusting(true);
    try {
      const { entry } = await adjustStock(workspaceId, variant.id, {
        warehouseId: adjWarehouse,
        delta,
        reason: adjReason.trim(),
      });
      const full = await getVariant(workspaceId, variant.id);
      setVariant(full);
      syncVariantFields(full);
      setLedger((prev) => [entry, ...prev]);
      setAdjDelta('');
      setAdjReason('');
      setNotice(copy.adjustedNotice);
      onChanged();
    } catch (err) {
      if (err instanceof CatalogClientError) setAdjError(err.message);
      else setAdjError(copy.genericError);
    } finally {
      setAdjusting(false);
    }
  }

  const mappings = variant?.mappings ?? [];
  const levels = variant?.levels ?? [];
  const warehouseName = (id: string) =>
    warehouses.find((w) => w.id === id)?.name ??
    warehouses.find((w) => w.id === id)?.code ??
    id;

  return (
    <div
      data-testid="sku-drawer-overlay"
      className="fixed inset-0 z-modal"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-neutral-900/40" aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={copy.drawerTitle}
        data-testid="sku-drawer"
        className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {copy.drawerTitle} · {copy.skuLabel}
            </p>
            {loading ? (
              <p className="text-sm text-neutral-500">{copy.loading}</p>
            ) : (
              <h2
                data-testid="drawer-sku-code"
                className="font-mono text-2xl font-bold text-neutral-900"
              >
                {variant?.skuCode ?? '—'}
              </h2>
            )}
            {product ? (
              <p className="text-sm text-neutral-600">
                {product.name} · {product.unit}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            data-testid="drawer-close"
            onClick={onClose}
            className={secondaryButtonClass}
          >
            {copy.drawerClose}
          </button>
        </div>

        <div className="flex-1 px-5 py-4">
          {error ? (
            <p
              role="alert"
              data-testid="drawer-error"
              className="rounded-lg border border-error-500 bg-error-500/10 px-4 py-3 text-sm text-neutral-900"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              data-testid="drawer-notice"
              className="rounded-lg border border-success-500 bg-success-500/10 px-4 py-3 text-sm text-neutral-900"
            >
              {notice}
            </p>
          ) : null}

          {!loading && product && (product.variants ?? []).length > 1 ? (
            <div className="mt-4">
              <label htmlFor="drawer-variant-picker" className={labelClass}>
                {copy.variantPickerLabel}
              </label>
              <select
                id="drawer-variant-picker"
                data-testid="drawer-variant-picker"
                className={inputClass}
                value={selectedVariantId ?? ''}
                onChange={(e) => void onSelectVariant(e.target.value)}
              >
                {(product.variants ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.skuCode}
                    {v.name ? ` — ${v.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {!loading && variant ? (
            <>
              {!canEdit ? (
                <p
                  data-testid="drawer-readonly-note"
                  className="mt-4 rounded-lg border border-info-500 bg-info-500/10 px-4 py-3 text-sm text-neutral-800"
                >
                  {copy.readOnlyNote}
                </p>
              ) : null}

              {canEdit ? (
                <form
                  data-testid="drawer-edit-form"
                  onSubmit={(e) => void onSaveDetails(e)}
                  className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                >
                  <h3 className="text-base font-semibold text-neutral-900">
                    {copy.editTitle}
                  </h3>
                  {formError ? (
                    <p
                      role="alert"
                      data-testid="drawer-form-error"
                      className="mt-2 text-sm text-error-500"
                    >
                      {formError}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-3">
                    <div>
                      <label
                        htmlFor="drawer-variant-name"
                        className={labelClass}
                      >
                        {copy.nameLabel}
                      </label>
                      <input
                        id="drawer-variant-name"
                        data-testid="drawer-variant-name"
                        className={inputClass}
                        value={variantName}
                        onChange={(e) => setVariantName(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="drawer-price" className={labelClass}>
                          {copy.priceInputLabel}
                        </label>
                        <input
                          id="drawer-price"
                          data-testid="drawer-price"
                          className={inputClass}
                          inputMode="numeric"
                          value={priceIdr}
                          onChange={(e) => setPriceIdr(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="drawer-hpp" className={labelClass}>
                          {copy.hppLabel}
                        </label>
                        <input
                          id="drawer-hpp"
                          data-testid="drawer-hpp"
                          className={inputClass}
                          inputMode="numeric"
                          placeholder="45000"
                          value={hppIdr}
                          onChange={(e) => setHppIdr(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">{copy.hppHint}</p>
                    <div>
                      <label
                        htmlFor="drawer-cost-source"
                        className={labelClass}
                      >
                        {copy.costSourceLabel}
                      </label>
                      <input
                        id="drawer-cost-source"
                        data-testid="drawer-cost-source"
                        className={inputClass}
                        placeholder={copy.costSourcePlaceholder}
                        value={costSource}
                        onChange={(e) => setCostSource(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="drawer-barcode" className={labelClass}>
                        {copy.barcodeLabel}
                      </label>
                      <input
                        id="drawer-barcode"
                        data-testid="drawer-barcode"
                        className={inputClass}
                        placeholder={copy.barcodePlaceholder}
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="drawer-listing" className={labelClass}>
                        {copy.listingNameLabel}
                      </label>
                      <input
                        id="drawer-listing"
                        data-testid="drawer-listing"
                        className={inputClass}
                        placeholder={copy.listingNamePlaceholder}
                        value={listingName}
                        onChange={(e) => setListingName(e.target.value)}
                      />
                    </div>
                    <div>
                      <button
                        type="submit"
                        data-testid="drawer-save"
                        disabled={saving}
                        className={primaryButtonClass}
                      >
                        {saving ? copy.saving : copy.saveButton}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <dl
                  data-testid="drawer-readonly-details"
                  className="mt-4 grid gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm"
                >
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">{copy.nameLabel}</dt>
                    <dd className="font-medium text-neutral-900">
                      {variant.name ?? '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">{copy.priceLabel}</dt>
                    <dd className="font-medium text-neutral-900">
                      {formatIdr(variant.sellingPriceCents)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">{copy.hppLabel}</dt>
                    <dd className="font-medium text-neutral-900">
                      {formatIdr(variant.hppCents)}
                      {variant.costSource ? ` · ${variant.costSource}` : ''}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-neutral-500">{copy.barcodeLabel}</dt>
                    <dd className="font-mono text-neutral-900">
                      {variant.barcode ?? '—'}
                    </dd>
                  </div>
                </dl>
              )}

              {canEditSku ? (
                <form
                  data-testid="drawer-sku-form"
                  onSubmit={(e) => void onSaveSkuCode(e)}
                  className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
                >
                  <label htmlFor="drawer-sku-code" className={labelClass}>
                    {copy.skuLabel} (Admin)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="drawer-sku-code"
                      data-testid="drawer-sku-code-input"
                      className={`${inputClass} font-mono`}
                      value={skuCode}
                      onChange={(e) => setSkuCode(e.target.value)}
                    />
                    <button
                      type="submit"
                      data-testid="drawer-sku-save"
                      disabled={saving}
                      className={secondaryButtonClass}
                    >
                      {saving ? copy.saving : copy.saveButton}
                    </button>
                  </div>
                  {skuLocked ? (
                    <p
                      data-testid="drawer-sku-locked"
                      className="mt-2 text-sm text-warning-500"
                    >
                      {copy.skuLockedNote}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-500">
                      {copy.skuAdminOnlyNote}
                    </p>
                  )}
                </form>
              ) : null}

              {canEdit ? (
                <form
                  data-testid="drawer-product-form"
                  onSubmit={(e) => void onSaveProductMeta(e)}
                  className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
                >
                  <h3 className="text-base font-semibold text-neutral-900">
                    {copy.picturesLabel}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {copy.picturesHint}
                  </p>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <label htmlFor="drawer-unit" className={labelClass}>
                        {copy.unitLabel}
                      </label>
                      <input
                        id="drawer-unit"
                        data-testid="drawer-unit"
                        className={inputClass}
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="drawer-pictures" className={labelClass}>
                        {copy.picturesLabel}
                      </label>
                      <input
                        id="drawer-pictures"
                        data-testid="drawer-pictures"
                        className={inputClass}
                        placeholder={copy.picturesPlaceholder}
                        value={picturesText}
                        onChange={(e) => setPicturesText(e.target.value)}
                      />
                    </div>
                    <div>
                      <button
                        type="submit"
                        data-testid="drawer-product-save"
                        disabled={saving}
                        className={secondaryButtonClass}
                      >
                        {saving ? copy.saving : copy.saveButton}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              <section
                aria-labelledby="drawer-mappings-title"
                className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <h3
                  id="drawer-mappings-title"
                  className="text-base font-semibold text-neutral-900"
                >
                  {copy.mappingsTitle}
                </h3>
                <p className="text-xs text-neutral-500">
                  {copy.mappingsSubtitle}
                </p>
                {mappings.length === 0 ? (
                  <p
                    data-testid="drawer-mappings-empty"
                    className="mt-2 text-sm text-neutral-500"
                  >
                    {copy.mappingsEmpty}
                  </p>
                ) : (
                  <ul
                    data-testid="drawer-mappings"
                    className="mt-2 divide-y divide-neutral-100"
                  >
                    {mappings.map((m) => (
                      <li
                        key={m.id}
                        data-testid="drawer-mapping-row"
                        className="py-2 text-sm"
                      >
                        <p className="font-semibold text-neutral-900">
                          {m.channel} ·{' '}
                          <span className="font-mono">{m.platformSkuId}</span>
                        </p>
                        <p className="text-neutral-600">
                          {copy.mappingShopLabel}: {m.shopExtId}
                          {m.sellerSkuHint ? ` · ${m.sellerSkuHint}` : ''}
                          {m.listingName ? ` · ${m.listingName}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section
                aria-labelledby="drawer-bundle-title"
                data-testid="drawer-bundle-section"
                className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <h3
                  id="drawer-bundle-title"
                  className="text-base font-semibold text-neutral-900"
                >
                  {copy.bundleSectionTitle}
                </h3>
                <p className="text-xs text-neutral-500">
                  {copy.bundleSectionSubtitle}
                </p>
                {bundle ? (
                  <ul
                    data-testid="drawer-bundle-list"
                    className="mt-2 divide-y divide-neutral-100"
                  >
                    {bundle.components.map((c) => (
                      <li
                        key={c.line.id}
                        data-testid="drawer-bundle-row"
                        className="flex items-center justify-between py-1 text-sm"
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
                ) : bundleMissing ? (
                  <p
                    data-testid="drawer-bundle-empty"
                    className="mt-2 text-sm text-neutral-500"
                  >
                    {copy.bundleSectionEmpty}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-neutral-500">—</p>
                )}
                {variant ? (
                  <p className="mt-2 text-sm">
                    <Link
                      href={`/produk/bundles?workspaceId=${encodeURIComponent(workspaceId)}&bundleVariantId=${encodeURIComponent(variant.id)}`}
                      data-testid="drawer-bundle-link"
                      className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
                    >
                      {copy.bundleOpenLink}
                    </Link>
                  </p>
                ) : null}
              </section>

              <section
                aria-labelledby="drawer-stock-title"
                className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <h3
                  id="drawer-stock-title"
                  className="text-base font-semibold text-neutral-900"
                >
                  {copy.stockTitle}
                </h3>
                <p className="text-xs text-neutral-500">{copy.stockSubtitle}</p>
                {levels.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-500">0</p>
                ) : (
                  <dl
                    data-testid="drawer-levels"
                    className="mt-2 divide-y divide-neutral-100"
                  >
                    {levels.map((l) => (
                      <div
                        key={l.warehouseId}
                        data-testid="drawer-level-row"
                        className="flex items-center justify-between py-2 text-sm"
                      >
                        <dt className="text-neutral-600">
                          {warehouseName(l.warehouseId)}
                        </dt>
                        <dd className="font-mono font-semibold text-neutral-900">
                          {l.qty}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <form
                  data-testid="drawer-adjust-form"
                  onSubmit={(e) => void onAdjust(e)}
                  className="mt-3 rounded-xl bg-neutral-50 p-3"
                >
                  {adjError ? (
                    <p
                      role="alert"
                      data-testid="drawer-adjust-error"
                      className="mb-2 text-sm text-error-500"
                    >
                      {adjError}
                    </p>
                  ) : null}
                  <div className="grid gap-2">
                    <div>
                      <label
                        htmlFor="drawer-adj-warehouse"
                        className={labelClass}
                      >
                        {copy.warehouseLabel}
                      </label>
                      <select
                        id="drawer-adj-warehouse"
                        data-testid="drawer-adj-warehouse"
                        className={inputClass}
                        value={adjWarehouse}
                        onChange={(e) => setAdjWarehouse(e.target.value)}
                      >
                        <option value="">—</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="drawer-adj-delta"
                          className={labelClass}
                        >
                          {copy.deltaLabel}
                        </label>
                        <input
                          id="drawer-adj-delta"
                          data-testid="drawer-adj-delta"
                          className={inputClass}
                          inputMode="numeric"
                          placeholder="10"
                          value={adjDelta}
                          onChange={(e) => setAdjDelta(e.target.value)}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="drawer-adj-reason"
                          className={labelClass}
                        >
                          {copy.reasonLabel}
                        </label>
                        <input
                          id="drawer-adj-reason"
                          data-testid="drawer-adj-reason"
                          className={inputClass}
                          placeholder={copy.reasonPlaceholder}
                          value={adjReason}
                          onChange={(e) => setAdjReason(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500">{copy.deltaHint}</p>
                    <div>
                      <button
                        type="submit"
                        data-testid="drawer-adjust-save"
                        disabled={adjusting}
                        className={primaryButtonClass}
                      >
                        {adjusting ? copy.adjusting : copy.adjustButton}
                      </button>
                    </div>
                  </div>
                </form>
              </section>

              <section
                aria-labelledby="drawer-ledger-title"
                className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
              >
                <h3
                  id="drawer-ledger-title"
                  className="text-base font-semibold text-neutral-900"
                >
                  {copy.ledgerTitle}
                </h3>
                {ledger.length === 0 ? (
                  <p
                    data-testid="drawer-ledger-empty"
                    className="mt-2 text-sm text-neutral-500"
                  >
                    {copy.ledgerEmpty}
                  </p>
                ) : (
                  <ul
                    data-testid="drawer-ledger"
                    className="mt-2 divide-y divide-neutral-100"
                  >
                    {ledger.map((entry) => (
                      <li
                        key={entry.id}
                        data-testid="drawer-ledger-row"
                        className="py-2 text-sm"
                      >
                        <p className="font-mono font-semibold text-neutral-900">
                          {entry.delta > 0 ? `+${entry.delta}` : entry.delta} →{' '}
                          {entry.balanceAfter}
                        </p>
                        <p className="text-neutral-600">
                          {entry.reason} · {warehouseName(entry.warehouseId)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

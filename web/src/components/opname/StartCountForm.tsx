'use client';

import { getStockCountCopy } from '@/lib/stock-count-copy';
import { StartCountScope, type SkuPickerRender } from './StartCountScope';
import { useStartCountForm } from './use-start-count-form';

const FIELD = 'mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3';
const BTN = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4';
const LABEL = 'block font-medium text-neutral-800';

export interface StartCountFormProps {
  workspaceId: string;
  onStarted: (sessionId: string) => void;
  onCancel: () => void;
  /** SKU picker (later slice); "SKU terpilih" is offered only when provided. */
  renderSkuPicker?: SkuPickerRender;
}

/**
 * Start form (US12 / RFC 03 task 44c, mockup 1): active warehouse, scope,
 * session name, snapshot note and the optional outbound-transfer freeze.
 * State lives in `useStartCountForm` (44a). Phone-first, 44 px targets.
 */
export function StartCountForm(props: StartCountFormProps) {
  const { workspaceId, onStarted, onCancel, renderSkuPicker } = props;
  const copy = getStockCountCopy('id');
  const f = useStartCountForm(workspaceId, onStarted);

  return (
    <form
      data-testid="opname-start-form"
      onSubmit={f.submit}
      className="mt-4 space-y-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm"
    >
      <h2 className="text-lg font-semibold text-neutral-900">
        {copy.startTitle}
      </h2>
      <p className="text-neutral-600">{copy.startSubtitle}</p>
      <label className={LABEL}>
        {copy.warehouseLabel}
        <select
          value={f.warehouseId}
          onChange={(e) => f.setWarehouseId(e.target.value)}
          className={`${FIELD} bg-white`}
        >
          {f.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <StartCountScope
        scope={f.scope}
        onScope={f.setScope}
        warehouseId={f.warehouseId}
        variantIds={f.variantIds}
        onVariantIds={f.setVariantIds}
        renderSkuPicker={renderSkuPicker}
      />
      <label className={LABEL}>
        {copy.nameLabel}
        <input
          value={f.name}
          maxLength={120}
          onChange={(e) => f.setName(e.target.value)}
          className={FIELD}
        />
      </label>
      <p className="rounded-lg bg-neutral-50 p-3 text-neutral-600">
        {copy.snapshotNote}
      </p>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={f.freeze}
          onChange={(e) => f.setFreeze(e.target.checked)}
        />
        {copy.freezeLabel}
      </label>
      {f.error && (
        <p role="alert" className="text-red-700">
          {f.error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          disabled={!f.canSubmit}
          className={`${BTN} bg-neutral-900 text-white disabled:opacity-50`}
        >
          {f.busy ? copy.starting : copy.submitStart}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`${BTN} border border-neutral-300`}
        >
          {copy.cancelButton}
        </button>
      </div>
    </form>
  );
}

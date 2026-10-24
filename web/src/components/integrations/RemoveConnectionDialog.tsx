'use client';

import { useEffect } from 'react';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationConnectCopy } from '@/lib/integration-connect-copy';
import { getIntegrationRemoveDialogCopy } from '@/lib/integration-remove-dialog-copy';

/**
 * Hapus koneksi confirm dialog (US20 / RFC 04 task 119b): connection
 * removed, mappings archived. Presentational; the parent calls
 * removeIntegrationConnection and drives busy / failed.
 */
export interface RemoveConnectionDialogProps {
  open: boolean;
  /** Store name (or provider store ID) · provider. */
  store: string;
  busy?: boolean;
  failed?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  lang?: IntegrationLang;
}

const BTN =
  'min-h-[44px] flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60';

export function RemoveConnectionDialog({
  open,
  store,
  busy = false,
  failed = false,
  onConfirm,
  onCancel,
  lang = 'id',
}: Readonly<RemoveConnectionDialogProps>) {
  const copy = getIntegrationRemoveDialogCopy(lang);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);
  if (!open) return null;
  return (
    <div
      data-testid="remove-connection-dialog-overlay"
      className="fixed inset-0 z-modal flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-connection-dialog-title"
        data-testid="remove-connection-dialog"
        className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="remove-connection-dialog-title"
          className="text-base font-semibold text-neutral-900"
        >
          {copy.title(store)}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>{copy.removed}</li>
          <li>{copy.mappingsArchived}</li>
          <li>{copy.ownershipReleased}</li>
          <li>{copy.historyKept}</li>
        </ul>
        <p className="text-sm text-neutral-600">{copy.reconnectNote}</p>
        {failed ? (
          <p role="alert" className="text-sm text-error-700">
            {copy.failed}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`${BTN} bg-error-500 text-white hover:bg-error-600`}
          >
            {busy ? copy.busy : copy.confirm}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={busy}
            className={`${BTN} border border-neutral-300 bg-white text-neutral-800`}
          >
            {getIntegrationConnectCopy(lang).cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

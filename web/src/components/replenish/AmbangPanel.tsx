'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VariantView } from '@tokoboss/contracts';
import { AmbangForm } from '@/components/replenish/AmbangForm';
import {
  ReplenishClientError,
  getReplenishVariant,
} from '@/lib/replenish-client';

/**
 * "Atur ambang" panel for one SKU (UTA-147 slice 4h, Story 11 web).
 * Loads the variant (fresh `version` for CAS) and renders AmbangForm. A 409
 * conflict reloads the variant so the next save uses the new version; other
 * errors (incl. reauth) go to the parent via `onError` (pass a stable one).
 */
export interface AmbangPanelProps {
  workspaceId: string;
  variantId: string;
  onClose: () => void;
  onError: (err: unknown) => void;
}

const CONFLICT =
  'Ambang sudah diubah orang lain. Data terbaru sudah dimuat, cek lalu simpan lagi.';

export function AmbangPanel({
  workspaceId,
  variantId,
  onClose,
  onError,
}: AmbangPanelProps) {
  const [variant, setVariant] = useState<VariantView | null>(null);
  const [loads, setLoads] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setVariant(await getReplenishVariant(workspaceId, variantId));
      setLoads((n) => n + 1);
    } catch (err) {
      onError(err);
    }
  }, [workspaceId, variantId, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleError = (err: unknown) => {
    if (err instanceof ReplenishClientError && err.status === 409) {
      setNotice(CONFLICT);
      setVariant(null);
      void load();
    } else {
      onError(err);
    }
  };

  return (
    <section
      aria-label="Atur ambang"
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-neutral-900">
          Atur ambang{variant ? ` · ${variant.skuCode}` : ''}
        </h2>
        <button
          type="button"
          className="min-h-[44px] px-3 text-sm font-semibold text-neutral-700"
          onClick={onClose}
        >
          Tutup
        </button>
      </div>
      {notice && (
        <p role="alert" className="text-sm text-warning-800">
          {notice}
        </p>
      )}
      {variant ? (
        <AmbangForm
          key={`${variant.id}:${loads}`}
          workspaceId={workspaceId}
          variant={variant}
          onSaved={(saved) => {
            setNotice(null);
            setVariant(saved);
          }}
          onError={handleError}
        />
      ) : (
        <p className="text-sm text-neutral-600">Memuat…</p>
      )}
    </section>
  );
}

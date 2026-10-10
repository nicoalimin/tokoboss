'use client';

import { useState } from 'react';
import type { LowStockRecommendationView } from '@tokoboss/contracts';
import { DraftPoPreviewCard } from '@/components/replenish/DraftPoPreviewCard';
import { createPurchaseOrderDraft } from '@/lib/replenish-client';
import {
  buildDraftPoPreview,
  draftReferenceNum,
  toCreateDraftBody,
} from '@/lib/replenish-draft';

/**
 * Draft-PO section of the Stok tipis panel (UTA-147 slice 3f, Story 11 web).
 * Previews the selected rows and creates a DRAFT purchase order only;
 * nothing is sent to a supplier. API errors go to the parent via `onError`.
 */
export interface ReplenishDraftSectionProps {
  workspaceId: string;
  selectedRecs: LowStockRecommendationView[];
  disabled?: boolean;
  onCreated: () => void;
  onError: (err: unknown) => void;
}

export function ReplenishDraftSection({
  workspaceId,
  selectedRecs,
  disabled = false,
  onCreated,
  onError,
}: ReplenishDraftSectionProps) {
  const [draftRef, setDraftRef] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const preview = buildDraftPoPreview(selectedRecs);

  const create = async (ref: string) => {
    setCreating(true);
    try {
      await createPurchaseOrderDraft(
        workspaceId,
        toCreateDraftBody(preview, ref)
      );
      setDraftRef(null);
      setNotice(`Draft PO ${ref} tersimpan. Belum dikirim ke supplier.`);
      onCreated();
    } catch (err) {
      onError(err);
    } finally {
      setCreating(false);
    }
  };

  if (draftRef) {
    return (
      <DraftPoPreviewCard
        preview={preview}
        referenceNum={draftRef}
        creating={creating}
        onCreate={() => void create(draftRef)}
        onCancel={() => setDraftRef(null)}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <p role="status" className="text-sm text-neutral-700">
          {notice}
        </p>
      )}
      {selectedRecs.length > 0 && (
        <button
          type="button"
          className="self-start rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
          disabled={disabled}
          onClick={() => {
            setNotice(null);
            setDraftRef(draftReferenceNum(new Date()));
          }}
        >
          Pratinjau draft PO ({selectedRecs.length})
        </button>
      )}
    </div>
  );
}

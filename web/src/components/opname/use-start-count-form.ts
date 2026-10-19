'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { StockCountScopeTypeWire } from '@tokoboss/contracts';
import { listWarehouses, type WarehouseView } from '@/lib/catalog-client';
import { startStockCount } from '@/lib/stock-count-client';

const GENERIC = 'Terjadi kesalahan. Coba lagi sebentar lagi.';
const msg = (e: unknown) => (e instanceof Error && e.message) || GENERIC;

/**
 * State for the Stock Opname start form (US12 / RFC 03 task 44a, mockup 1):
 * loads active warehouses, tracks scope / SKUs / name / freeze, and POSTs the
 * start call. Changing the warehouse clears selected SKUs. The form markup is
 * `StartCountForm.tsx` (task 44b); errors are client-safe Bahasa Indonesia.
 */
export function useStartCountForm(
  workspaceId: string,
  onStarted: (sessionId: string) => void
) {
  const [warehouses, setWarehouses] = useState<WarehouseView[]>([]);
  const [warehouseId, setWarehouse] = useState('');
  const [scope, setScope] = useState<StockCountScopeTypeWire>('all');
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [freeze, setFreeze] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    listWarehouses(workspaceId)
      .then((all) => {
        if (off) return;
        const active = all.filter((w) => w.status === 'active');
        setWarehouses(active);
        setWarehouse((cur) => cur || active[0]?.id || '');
      })
      .catch((e: unknown) => !off && setError(msg(e)));
    return () => {
      off = true;
    };
  }, [workspaceId]);

  const skus = scope === 'skus';
  const ready = warehouseId !== '' && name.trim() !== '';
  const canSubmit = !busy && ready && (!skus || variantIds.length > 0);

  function setWarehouseId(id: string) {
    setWarehouse(id);
    setVariantIds([]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const { session } = await startStockCount(workspaceId, {
        warehouseId,
        name: name.trim(),
        scopeType: scope,
        ...(skus ? { variantIds } : {}),
        freezeOutboundTransfers: freeze,
      });
      onStarted(session.id);
    } catch (err) {
      setError(msg(err));
      setBusy(false);
    }
  }

  return {
    warehouses,
    warehouseId,
    setWarehouseId,
    scope,
    setScope,
    variantIds,
    setVariantIds,
    name,
    setName,
    freeze,
    setFreeze,
    busy,
    error,
    canSubmit,
    submit,
  };
}

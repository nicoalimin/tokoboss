'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMembership } from '@/lib/use-membership';
import {
  getLedger,
  adjustStock,
  getStockBalance,
  getStockSettings,
  listWarehouses,
} from '@/lib/catalog-client';

// Import error types
import { CatalogClientError } from '@/lib/catalog-client';

// Types
interface LedgerEntry {
  id: string;
  warehouseId: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  actorId: string | null;
  correlationId: string | null;
  createdAt: string;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
  status: 'active' | 'deactivated';
}

interface StockBalance {
  variantId: string;
  workspaceId: string;
  totalQty: number;
  perWarehouse: Array<{
    warehouseId: string;
    qty: number;
    version: number;
  }>;
}

interface StockSettings {
  workspaceId: string;
  allowNegative: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// This component would be used by the page to display UI elements
export default function LedgerClient({
  variantId,
}: {
  variantId: string;
}) {
  const router = useRouter();
  const { membership, loading: membershipLoading } = useMembership();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockBalance, setStockBalance] = useState<StockBalance | null>(null);
  const [stockSettings, setStockSettings] = useState<StockSettings | null>(
    null
  );
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [adjustmentForm, setAdjustmentForm] = useState({
    warehouseId: '',
    delta: 0,
    reason: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!membership?.workspaceId) return;

    const fetchData = async () => {
      try {
        // Fetch required data
        const [ledgerData, warehouseData, balanceData, settingsData] =
          await Promise.all([
            getLedger(membership.workspaceId, variantId),
            listWarehouses(membership.workspaceId),
            getStockBalance(membership.workspaceId, variantId),
            getStockSettings(membership.workspaceId),
          ]);

        setLedgerEntries(ledgerData);
        setWarehouses(warehouseData);
        setStockBalance(balanceData);
        setStockSettings(settingsData);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
  }, [variantId, membership?.workspaceId]);

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!membership?.workspaceId) return;

    setIsSubmitting(true);
    setAdjustmentError(null);

    try {
      // Get warehouse-specific version for expectedVersion 
      let expectedVersion: number | undefined = undefined;
      if (stockBalance && adjustmentForm.warehouseId) {
        const warehouseLevel = stockBalance.perWarehouse.find(
          (wh) => wh.warehouseId === adjustmentForm.warehouseId
        );
        expectedVersion = warehouseLevel?.version;
      }

      await adjustStock(membership.workspaceId, variantId, {
        warehouseId: adjustmentForm.warehouseId,
        delta: adjustmentForm.delta,
        reason: adjustmentForm.reason,
        idempotencyKey: `adjustment-${Date.now()}`,
        expectedVersion, // Include the current version from stock balance
      });

      // After successful adjustment, reload data
      const [newLedger, newBalance] = await Promise.all([
        getLedger(membership.workspaceId, variantId),
        getStockBalance(membership.workspaceId, variantId),
      ]);

      setLedgerEntries(newLedger);
      setStockBalance(newBalance);

      // Reset form
      setAdjustmentForm({
        warehouseId: '',
        delta: 0,
        reason: '',
      });
    } catch (err) {
      if (err instanceof CatalogClientError) {
        // Specific error mapping for adjustment errors
        switch (err.errorCode) {
          case 'CATALOG_INSUFFICIENT_STOCK':
            setAdjustmentError('Insufficient stock available for this warehouse.');
            break;
          case 'CATALOG_WAREHOUSE_INACTIVE':
            setAdjustmentError('Warehouse is inactive. Please select an active warehouse.');
            break;
          case 'CATALOG_VERSION_CONFLICT':
            setAdjustmentError(
              'Someone else changed this row first. Close and reopen the drawer, then try again.'
            );
            break;
          default:
            setAdjustmentError(err.message);
        }
      } else if (err instanceof Error) {
        setAdjustmentError(err.message);
      } else {
        setAdjustmentError('An unexpected error occurred');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedWarehouse(e.target.value);
  };

  // Filter ledger entries based on selected warehouse
  const filteredEntries =
    selectedWarehouse === 'all'
      ? ledgerEntries
      : ledgerEntries.filter(
          (entry) => entry.warehouseId === selectedWarehouse
        );

  const warehouseOptions = [
    { id: 'all', name: 'All Warehouses' },
    ...warehouses.map((w) => ({ id: w.id, name: `${w.code} - ${w.name}` })),
  ];

  // Get warehouse names for displaying ledger entries
  const getWarehouseName = (warehouseId: string) => {
    const warehouse = warehouses.find((w) => w.id === warehouseId);
    return warehouse
      ? `${warehouse.code} - ${warehouse.name}`
      : 'Unknown Warehouse';
  };

  // Check if user has permission to adjust stock
  const canAdjustStock =
    membership?.role === 'manager' || membership?.role === 'admin';

  // Total quantity from the stock balance
  const totalQty = stockBalance ? stockBalance.totalQty : 0;

  // Per-warehouse quantities
  const warehouseQuantities = stockBalance
    ? stockBalance.perWarehouse.map((wh) => {
        const warehouse = warehouses.find((w) => w.id === wh.warehouseId);
        return {
          ...wh,
          name: warehouse
            ? `${warehouse.code} - ${warehouse.name}`
            : 'Unknown Warehouse',
        };
      })
    : [];

  if (membershipLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!membership?.workspaceId && !membershipLoading) {
    router.push('/sign-in');
    return null;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="text-center mb-6">
            <p className="text-2xl font-bold text-neutral-900">Stock Ledger</p>
          </div>
          <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
              {error}
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">Stock Ledger</p>
        </div>
        <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">
              Stock Overview
            </h2>

            {/* Consolidated total stock */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border-r border-neutral-200 pr-4">
                  <p className="text-sm text-neutral-600">Total Stock</p>
                  <p className="text-2xl font-bold">{totalQty}</p>
                </div>
                <div className="border-r border-neutral-200 pr-4">
                  <p className="text-sm text-neutral-600">Status</p>
                  <p className="text-xl font-semibold">
                    {stockSettings?.allowNegative ? (
                      <span className="text-green-600">Allow Negative</span>
                    ) : (
                      <span className="text-red-600">Deny Negative</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-600">
                    Adjustment Permissions
                  </p>
                  <p className="text-xl font-semibold">
                    {canAdjustStock ? (
                      <span className="text-green-600">Read/Write</span>
                    ) : (
                      <span className="text-red-600">Read Only</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Per-warehouse stock */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium text-neutral-900 mb-3">
                Per-Warehouse Stock
              </h3>
              {warehouseQuantities.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Warehouse
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          Stock
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {warehouseQuantities.map((wh, index) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm text-neutral-900">
                            {wh.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-900">
                            {wh.qty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-neutral-500">No warehouse data available</p>
              )}
            </div>
          </div>

          {/* Adjustment form if user has permission */}
          {canAdjustStock && (
            <div className="mb-8 border-t border-neutral-200 pt-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Record Stock Adjustment
              </h2>

              <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
                {adjustmentError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                    {adjustmentError}
                  </div>
                )}
                
                <div>
                  <label
                    htmlFor="warehouse"
                    className="block text-sm font-medium text-neutral-700 mb-1"
                  >
                    Warehouse
                  </label>
                  <select
                    id="warehouse"
                    value={adjustmentForm.warehouseId}
                    onChange={(e) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        warehouseId: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-secondary-500"
                    required
                  >
                    <option value="">Select a warehouse</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.code} - {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="delta"
                    className="block text-sm font-medium text-neutral-700 mb-1"
                  >
                    Adjustment Amount
                  </label>
                  <input
                    type="number"
                    id="delta"
                    value={adjustmentForm.delta}
                    onChange={(e) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        delta: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-secondary-500"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="reason"
                    className="block text-sm font-medium text-neutral-700 mb-1"
                  >
                    Reason for Adjustment
                  </label>
                  <textarea
                    id="reason"
                    value={adjustmentForm.reason}
                    onChange={(e) =>
                      setAdjustmentForm({
                        ...adjustmentForm,
                        reason: e.target.value,
                      })
                    }
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-secondary-500"
                    rows={3}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 bg-secondary-600 text-white font-medium rounded-md hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-500 disabled:opacity-50"
                >
                  {isSubmitting ? 'Processing...' : 'Record Adjustment'}
                </button>
              </form>
            </div>
          )}

          {/* Ledger entries */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-neutral-900">
                Stock Ledger
              </h2>

              <div className="flex items-center space-x-2">
                <label
                  htmlFor="warehouse-filter"
                  className="block text-sm font-medium text-neutral-700"
                >
                  Filter by Warehouse:
                </label>
                <select
                  id="warehouse-filter"
                  value={selectedWarehouse}
                  onChange={handleWarehouseChange}
                  className="rounded-md border border-neutral-300 px-3 py-1 text-neutral-900 focus:outline-none focus:ring-2 focus:ring-secondary-500"
                >
                  {warehouseOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredEntries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Warehouse
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Delta
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {filteredEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-3 text-sm text-neutral-900">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-900">
                          {getWarehouseName(entry.warehouseId)}
                        </td>
                        <td
                          className={`px-4 py-3 text-sm font-medium ${
                            entry.delta > 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {entry.delta > 0 ? '+' : ''}
                          {entry.delta}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-900">
                          {entry.balanceAfter}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-900">
                          {entry.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-neutral-500">No ledger entries found</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
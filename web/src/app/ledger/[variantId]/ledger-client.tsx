'use client';

import { useState, useEffect } from 'react';
import {
  getLedger,
  getStockBalance,
  adjustStock,
  listWarehouses,
  getStockSettings,
} from '@/lib/catalog-client';

export default function LedgerClient({ variantId }: { variantId: string }) {
  const [stockInfo, setStockInfo] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stockSettings, setStockSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    warehouseId: '',
    delta: 0,
    reason: '',
    idempotencyKey: '',
  });
  const [isAdjusting, setIsAdjusting] = useState(false);

  // Load data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get stock balance (consolidated + per-warehouse)
        const balance = await getStockBalance(variantId, {});
        setStockInfo(balance);

        // Get ledger entries
        const ledgerEntries = await getLedger(variantId, {});
        setEntries(ledgerEntries);

        // Get warehouses for adjustment form
        const warehouseList = await listWarehouses({});
        setWarehouses(warehouseList);

        // Get stock settings
        const settings = await getStockSettings({});
        setStockSettings(settings);
      } catch (err: any) {
        console.error('Failed to fetch data:', err);
        setError(err.message || 'Failed to load ledger data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [variantId]);

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentForm.warehouseId) return;

    setIsAdjusting(true);

    try {
      // TODO: Need version handling for consistency - this would require
      // getting the current warehouse level to get its version
      await adjustStock('workspaceId', variantId, {
        warehouseId: adjustmentForm.warehouseId,
        delta: adjustmentForm.delta,
        reason: adjustmentForm.reason,
        idempotencyKey: adjustmentForm.idempotencyKey || undefined,
      });

      // Refresh data after successful adjustment
      const balance = await getStockBalance(variantId);
      setStockInfo(balance);
      const ledgerEntries = await getLedger(variantId);
      setEntries(ledgerEntries);

      // Reset form
      setAdjustmentForm({
        warehouseId: '',
        delta: 0,
        reason: '',
        idempotencyKey: '',
      });
    } catch (err: any) {
      console.error('Failed to adjust stock:', err);
      setError(err.message || 'Failed to make adjustment');
    } finally {
      setIsAdjusting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">
          Stock Ledger
        </h1>
        <p className="text-neutral-600">
          Review stock adjustments for variant {variantId}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Info */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">
              Stock Summary
            </h2>
            {stockInfo ? (
              <div className="space-y-3">
                <p className="text-sm">
                  <span className="font-medium">Total Stock:</span>{' '}
                  {stockInfo.totalQty}
                </p>
                {stockInfo.perWarehouse && (
                  <div>
                    <p className="text-sm font-medium">Stock by Warehouse</p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {stockInfo.perWarehouse.map((warehouse: any) => (
                        <li key={warehouse.warehouseId}>
                          {warehouse.qty} in {warehouse.warehouseId}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p>Loading stock information...</p>
            )}
          </div>

          {/* Adjustment Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">
              Adjust Stock
            </h2>
            <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Warehouse
                </label>
                <select
                  value={adjustmentForm.warehouseId}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      warehouseId: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="">Select Warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Quantity Change
                </label>
                <input
                  type="number"
                  value={adjustmentForm.delta || ''}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      delta: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={adjustmentForm.reason}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      reason: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Idempotency Key (optional)
                </label>
                <input
                  type="text"
                  value={adjustmentForm.idempotencyKey}
                  onChange={(e) =>
                    setAdjustmentForm({
                      ...adjustmentForm,
                      idempotencyKey: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <button
                type="submit"
                disabled={isAdjusting}
                className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {isAdjusting ? 'Adjusting...' : 'Make Adjustment'}
              </button>
            </form>
          </div>

          {/* Negative Stock Info */}
          {stockSettings && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Stock Settings
              </h2>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Allow Negative Stock:</span>{' '}
                  {stockSettings.allowNegative ? 'Yes' : 'No'}
                </p>
                {!stockSettings.allowNegative && (
                  <p className="text-sm text-yellow-600">
                    Warning: Negative stock is currently disabled
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column - Ledger History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ledger History Table */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">
              Stock Ledger History
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Reason
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${entry.delta > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                        >
                          {entry.delta > 0 ? 'IN' : 'OUT'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {Math.abs(entry.delta)}
                      </td>
                      <td className="px-6 py-4">{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

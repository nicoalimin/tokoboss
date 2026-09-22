'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getLedger,
  listWarehouses,
  getStockBalance,
  getStockSettings,
  adjustStock,
} from '@/lib/catalog';
import { Warehouse } from '@tokoboss/types';

export interface LedgerEntry {
  id: string;
  timestamp: Date;
  delta: number;
  reason: string;
  warehouseId: string;
}

export interface StockBalance {
  variantId: string;
  total: number;
  byWarehouse: Array<{
    warehouseId: string;
    remaining: number;
  }>;
}

export interface LedgerClientProps {
  variantId: string;
  warehouseId?: string | null;
  memberRole: 'staff' | 'manager' | 'admin';
}

const LedgerClient = ({
  variantId,
  warehouseId,
  memberRole,
}: LedgerClientProps) => {
  const router = useRouter();
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [balance, setBalance] = useState<StockBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    reason: '',
    delta: '',
    warehouseId: warehouseId || '',
    idempotencyKey: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch warehouses
        const fetchedWarehouses = await listWarehouses();
        setWarehouses(fetchedWarehouses);

        // Fetch stock balance
        const stockBalance = await getStockBalance(variantId);
        setBalance(stockBalance);

        // Fetch ledger entries
        const ledger = await getLedger({
          variantId,
          warehouseId: warehouseId || undefined,
        });
        setLedgerEntries(ledger);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [variantId, warehouseId]);

  const handleAdjustmentChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setAdjustmentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!adjustmentForm.warehouseId) {
        throw new Error('Warehouse ID is required');
      }
      if (!adjustmentForm.reason.trim()) {
        throw new Error('Reason is required');
      }

      const deltaValue = parseInt(adjustmentForm.delta, 10);
      if (isNaN(deltaValue)) {
        throw new Error('Invalid delta value');
      }

      // Get expected version from stock settings
      const settings = await getStockSettings();

      // Make the adjustment call
      await adjustStock({
        variantId,
        warehouseId: adjustmentForm.warehouseId,
        delta: deltaValue,
        reason: adjustmentForm.reason,
        idempotencyKey:
          adjustmentForm.idempotencyKey || `adjustment-${Date.now()}`,
        expectedVersion: settings.version, // This would come from the actual stock settings
      });

      // Reset form after successful submission
      setAdjustmentForm({
        reason: '',
        delta: '',
        warehouseId: warehouseId || '',
        idempotencyKey: '',
      });

      // Refetch data for updated state
      const updatedBalance = await getStockBalance(variantId);
      const updatedLedger = await getLedger({
        variantId,
        warehouseId: warehouseId || undefined,
      });

      setBalance(updatedBalance);
      setLedgerEntries(updatedLedger);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to submit adjustment'
      );
      console.error('Adjustment error:', err);
      // Re-throw but don't stop UI flow
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading stock ledger...</div>;
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 text-red-700 rounded">
        Error loading data: {error}
      </div>
    );
  }

  if (!balance) {
    return <div className="p-4">No stock data available</div>;
  }

  // Render the ledger UI
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Stock Ledger</h1>

      {/* Consolidated Stock Summary */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-3">Consolidated Stock</h2>
        <p className="text-3xl font-bold">Total: {balance.total}</p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map((warehouse) => {
            const warehouseBalance = balance.byWarehouse.find(
              (b) => b.warehouseId === warehouse.id
            );
            return (
              <div key={warehouse.id} className="p-3 border rounded">
                <h3 className="font-medium">{warehouse.name}</h3>
                {warehouseBalance ? (
                  <p className="text-lg">
                    Remaining: {warehouseBalance.remaining}
                  </p>
                ) : (
                  <p className="text-gray-500">No stock data</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Ledger Entries */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Ledger Entries</h2>
        {ledgerEntries.length > 0 ? (
          <table className="min-w-full bg-white border rounded">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Warehouse</th>
                <th className="p-2 text-left">Reason</th>
                <th className="p-2 text-left">Change</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.map((entry) => (
                <tr key={entry.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">
                    {entry.timestamp.toLocaleDateString()}
                  </td>
                  <td className="p-2">
                    {warehouses.find((w) => w.id === entry.warehouseId)?.name ||
                      entry.warehouseId}
                  </td>
                  <td className="p-2">{entry.reason}</td>
                  <td
                    className={`p-2 ${entry.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {entry.delta >= 0 ? '+' : ''}
                    {entry.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-gray-500">No ledger entries found</p>
        )}
      </div>

      {/* Adjustment Form */}
      {memberRole !== 'staff' && (
        <div className="p-4 border rounded-lg bg-blue-50">
          <h2 className="text-xl font-semibold mb-3">Submit Adjustment</h2>
          <form onSubmit={handleSubmitAdjustment} className="space-y-4">
            <div>
              <label htmlFor="reason" className="block text-sm font-medium">
                Reason *
              </label>
              <textarea
                id="reason"
                name="reason"
                value={adjustmentForm.reason}
                onChange={handleAdjustmentChange}
                required
                className="w-full p-2 border rounded"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="delta" className="block text-sm font-medium">
                  Adjustment Amount *
                </label>
                <input
                  type="number"
                  id="delta"
                  name="delta"
                  value={adjustmentForm.delta}
                  onChange={handleAdjustmentChange}
                  required
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <label
                  htmlFor="warehouseId"
                  className="block text-sm font-medium"
                >
                  Warehouse *
                </label>
                <select
                  id="warehouseId"
                  name="warehouseId"
                  value={adjustmentForm.warehouseId}
                  onChange={handleAdjustmentChange}
                  required
                  className="w-full p-2 border rounded"
                >
                  <option value="">Select warehouse</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="negativeStock"
                name="allowNegativeStock"
                className="mr-2"
              />
              <label htmlFor="negativeStock" className="text-sm">
                Allow negative stock (if configured)
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Adjustment'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default LedgerClient;

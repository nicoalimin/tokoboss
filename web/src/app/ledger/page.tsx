'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { id } from '@tokoboss/contracts';
import { useMembership } from '@/lib/use-membership';
import { fetchLedger, postAdjustment } from '@/lib/catalog-client';
import { StockSettingsView, LedgerEntryView } from '@tokoboss/contracts';
import { getStockSettings } from '@/lib/catalog-client';

export default function StockLedgerPage() {
  const pathname = usePathname();
  const router = useRouter();
  const membership = useMembership();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    warehouseId: '',
    delta: '',
    reason: '',
  });
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [adjustmentSuccess, setAdjustmentSuccess] = useState(false);
  const [stockSettings, setStockSettings] = useState<StockSettingsView | null>(null);

  // Get the variantId from the URL
  useEffect(() => {
    // Extract variant ID from the path (e.g., /ledger/variant_123)
    const variantId = pathname.split('/').pop();
    if (variantId && variantId !== 'ledger') {
      setSelectedVariantId(variantId);
      
      // Load ledger data for this variant
      loadLedgerData(variantId, warehouseId);
      
      // Load stock settings
      loadStockSettings(variantId);
    } else {
      setError('No variant selected');
      setLoading(false);
    }
  }, [pathname, warehouseId]);

  const loadLedgerData = async (variantId: string, warehouseId?: string | null) => {
    if (!variantId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchLedger(variantId, warehouseId || undefined);
      setLedgerEntries(data.entries);
    } catch (err) {
      setError('Failed to load ledger data: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const loadStockSettings = async (variantId: string) => {
    try {
      // Get stock settings from the workspace (this would be a global setting)
      // Note: We'll hardcode this for now as workspace-wide setting, but in reality it should come from a workspace context
      const data = await getStockSettings();
      setStockSettings(data.settings);
    } catch (err) {
      console.error('Failed to load stock settings:', err);
    }
  };

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newWarehouseId = e.target.value || null;
    setWarehouseId(newWarehouseId);
    if (selectedVariantId) {
      loadLedgerData(selectedVariantId, newWarehouseId);
    }
  };

  const handleAdjustmentInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAdjustmentForm(prev => ({ ...prev, [name]: value }));
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedVariantId) return;
    
    try {
      setAdjustmentError(null);
      setAdjustmentSuccess(false);
      
      // Validate input
      if (!adjustmentForm.warehouseId || !adjustmentForm.delta || !adjustmentForm.reason) {
        throw new Error('Warehouse, delta and reason are required');
      }
      
      const delta = Number(adjustmentForm.delta);
      if (isNaN(delta)) {
        throw new Error('Delta must be a number');
      }

      // Submit adjustment
      await postAdjustment(selectedVariantId, {
        warehouseId: adjustmentForm.warehouseId,
        delta,
        reason: adjustmentForm.reason,
        idempotencyKey: id(), // Generate a unique idempotency key
      });

      setAdjustmentSuccess(true);
      setAdjustmentForm({ warehouseId: '', delta: '', reason: '' });
      
      // Reload ledger data after successful adjustment
      if (selectedVariantId) {
        loadLedgerData(selectedVariantId, warehouseId);
      }
    } catch (err) {
      setAdjustmentError(err instanceof Error ? err.message : 'Failed to submit adjustment');
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
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
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">Stock Ledger</h1>
        <p className="text-neutral-600">Review stock adjustments and make reasoned changes</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Filters & Adjustment Form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Filter Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Filters</h2>
            
            <div className="mb-4">
              <label htmlFor="warehouse" className="block text-sm font-medium text-neutral-700 mb-1">
                Warehouse
              </label>
              <select
                id="warehouse"
                value={warehouseId || ''}
                onChange={handleWarehouseChange}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">All Warehouses</option>
                <option value="wh_jkt_1">Jakarta Warehouse 1</option>
                <option value="wh_jkt_2">Jakarta Warehouse 2</option>
                <option value="wh_bdg_1">Bandung Warehouse 1</option>
              </select>
            </div>

            <div className="mb-4">
              <label htmlFor="sku" className="block text-sm font-medium text-neutral-700 mb-1">
                SKU
              </label>
              <input
                type="text"
                id="sku"
                readOnly
                value={selectedVariantId || ''}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 bg-gray-50"
              />
            </div>
          </div>

          {/* Adjustment Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Make Adjustment</h2>
            
            {adjustmentSuccess && (
              <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4">
                <p className="text-green-700">Adjustment submitted successfully!</p>
              </div>
            )}

            {adjustmentError && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
                <p className="text-red-700">{adjustmentError}</p>
              </div>
            )}

            <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
              <div>
                <label htmlFor="adj-warehouse" className="block text-sm font-medium text-neutral-700 mb-1">
                  Warehouse
                </label>
                <select
                  id="adj-warehouse"
                  name="warehouseId"
                  value={adjustmentForm.warehouseId}
                  onChange={handleAdjustmentInputChange}
                  required
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select Warehouse</option>
                  <option value="wh_jkt_1">Jakarta Warehouse 1</option>
                  <option value="wh_jkt_2">Jakarta Warehouse 2</option>
                  <option value="wh_bdg_1">Bandung Warehouse 1</option>
                </select>
              </div>

              <div>
                <label htmlFor="delta" className="block text-sm font-medium text-neutral-700 mb-1">
                  Quantity Change
                </label>
                <input
                  type="number"
                  id="delta"
                  name="delta"
                  value={adjustmentForm.delta}
                  onChange={handleAdjustmentInputChange}
                  required
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
                <p className="mt-1 text-sm text-neutral-500">
                  Positive for stock in, negative for stock out
                </p>
              </div>

              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-neutral-700 mb-1">
                  Reason
                </label>
                <textarea
                  id="reason"
                  name="reason"
                  value={adjustmentForm.reason}
                  onChange={handleAdjustmentInputChange}
                  required
                  rows={3}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-primary-500 hover:bg-primary-600 text-white font-medium py-2 px-4 rounded-md transition duration-200"
              >
                Submit Adjustment
              </button>
            </form>
          </div>
        </div>

        {/* Right column - Stock Summary & Ledger Entries */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stock Summary */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Stock Summary</h2>
            
            {stockSettings && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Negative Stock Policy
                </label>
                <p className="text-sm text-neutral-600">
                  {stockSettings.allowNegative ? 'Enabled' : 'Disabled'} - 
                  {stockSettings.allowNegative 
                    ? ' Adjustments can result in negative stock' 
                    : ' Adjustments that would result in negative stock are rejected'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h3 className="text-sm font-medium text-blue-800">Total Stock</h3>
                <p className="text-2xl font-bold text-blue-900">1,234 units</p>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <h3 className="text-sm font-medium text-green-800">Available Stock</h3>
                <p className="text-2xl font-bold text-green-900">987 units</p>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <h3 className="text-sm font-medium text-purple-800">Reserved</h3>
                <p className="text-2xl font-bold text-purple-900">247 units</p>
              </div>
            </div>
          </div>

          {/* Warehouse Stock Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Per-Warehouse Stock</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-medium text-neutral-900">Jakarta Warehouse 1</h3>
                <p className="text-2xl font-bold text-blue-600">567 units</p>
              </div>
              
              <div className="border rounded-lg p-4">
                <h3 className="font-medium text-neutral-900">Jakarta Warehouse 2</h3>
                <p className="text-2xl font-bold text-blue-600">342 units</p>
              </div>
              
              <div className="border rounded-lg p-4">
                <h3 className="font-medium text-neutral-900">Bandung Warehouse 1</h3>
                <p className="text-2xl font-bold text-blue-600">235 units</p>
              </div>
            </div>
          </div>

          {/* Ledger Entries */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Stock Ledger History</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Warehouse
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Change
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {ledgerEntries.length > 0 ? (
                    ledgerEntries.map((entry, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {formatTimestamp(entry.timestamp)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {entry.warehouseId}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {entry.delta > 0 ? (
                            <span className="text-green-600">+{entry.delta}</span>
                          ) : (
                            <span className="text-red-600">{entry.delta}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-900">
                          {entry.reason}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {entry.balance}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-sm text-neutral-500">
                        No ledger entries found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
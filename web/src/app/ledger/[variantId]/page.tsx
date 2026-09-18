'use client';

import { useState, useEffect } from 'react';

// Mock data for demonstration - in reality this would come from API calls
const mockLedgerEntries = [
  {
    id: '1',
    date: new Date('2023-01-01'),
    type: 'IN',
    quantity: 100,
    reason: 'Purchase',
  },
  { 
    id: '2', 
    date: new Date('2023-01-05'), 
    type: 'OUT', 
    quantity: 25, 
    reason: 'Sale' 
  },
  { 
    id: '3', 
    date: new Date('2023-01-10'), 
    type: 'IN', 
    quantity: 75, 
    reason: 'Return' 
  },
];

const mockStockInfo = {
  currentStock: 150,
  reservedStock: 25,
  availableStock: 125,
};

export default function Page({ params }: { params: { variantId: string } }) {
  const [stockInfo, setStockInfo] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API calls
    const fetchData = async () => {
      try {
        // In a real implementation:
        // const stockData = await getStockBalance(params.variantId);
        // const ledgerData = await getLedgerEntries(params.variantId);
        
        // Mock data for now
        setStockInfo(mockStockInfo);
        setEntries(mockLedgerEntries);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [params.variantId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">Stock Ledger</h1>
        <p className="text-neutral-600">Review stock adjustments for variant {params.variantId}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Filters and Adjustment Form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Filters Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Filters</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Date Range</label>
                <input 
                  type="date" 
                  className="w-full p-2 border border-neutral-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Type</label>
                <select className="w-full p-2 border border-neutral-300 rounded-md">
                  <option>All</option>
                  <option>IN</option>
                  <option>OUT</option>
                </select>
              </div>
              <button className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600">
                Apply Filters
              </button>
            </div>
          </div>

          {/* Adjustment Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Make Adjustment</h2>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Type</label>
                <select className="w-full p-2 border border-neutral-300 rounded-md">
                  <option>IN (Increase Stock)</option>
                  <option>OUT (Decrease Stock)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Quantity</label>
                <input 
                  type="number" 
                  className="w-full p-2 border border-neutral-300 rounded-md"
                  placeholder="Enter quantity"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Reason</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-neutral-300 rounded-md"
                  placeholder="Enter reason"
                />
              </div>
              <button 
                type="submit" 
                className="w-full bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600"
              >
                Submit Adjustment
              </button>
            </form>
          </div>
        </div>

        {/* Right column - Stock Summary and Ledger History */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stock Summary Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Stock Summary</h2>
            {stockInfo ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-md">
                  <p className="text-sm text-blue-700">Current Stock</p>
                  <p className="text-2xl font-bold">{stockInfo.currentStock}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-md">
                  <p className="text-sm text-yellow-700">Reserved Stock</p>
                  <p className="text-2xl font-bold">{stockInfo.reservedStock}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-md">
                  <p className="text-sm text-green-700">Available Stock</p>
                  <p className="text-2xl font-bold">{stockInfo.availableStock}</p>
                </div>
              </div>
            ) : (
              <p>Loading stock information...</p>
            )}
          </div>

          {/* Ledger History Table */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">Stock Ledger History</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Reason</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-6 py-4 whitespace-nowrap">{entry.date.toLocaleDateString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                          ${entry.type === 'IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {entry.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{entry.quantity}</td>
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
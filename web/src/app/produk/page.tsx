'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
// Import other necessary dependencies
import { useMembership } from '@/lib/use-membership';
import { getProfileCopy } from '@/lib/profile-copy';
import { ProductsPanel } from '@/components/catalog/ProductsPanel';
import { SkuDrawer } from '@/components/catalog/SkuDrawer';

export default function ProductsPage() {
  const membership = useMembership();
  const copy = getProfileCopy('en');
  const [activeTab, setActiveTab] = useState<'products' | 'ledger'>('products');
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">Produk & Stok</h1>
        <p className="text-neutral-600">Manage your inventory and products</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-neutral-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('products')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'products'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'ledger'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            Stock Ledger
          </button>
        </nav>
      </div>

      {activeTab === 'products' ? (
        <ProductsPanel />
      ) : (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-neutral-200">
            <h2 className="text-xl font-semibold text-neutral-900">Stock Ledger</h2>
            <p className="text-neutral-600">View stock adjustments and history</p>
          </div>

          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500">Select a variant to view its ledger</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium text-neutral-900">No variant selected</h3>
                <p className="text-sm text-neutral-600">
                  Navigate to a product and select it to view its inventory ledger
                </p>
              </div>
            </div>

            {/* Show a ledger panel if a variant is selected */}
            {selectedVariantId && (
              <div className="mt-6">
                <h3 className="text-lg font-medium text-neutral-900">Ledger for {selectedVariantId}</h3>
                <Link 
                  href={`/ledger/${selectedVariantId}`}
                  className="inline-block mt-2 text-primary-600 hover:text-primary-800"
                >
                  View detailed ledger history
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
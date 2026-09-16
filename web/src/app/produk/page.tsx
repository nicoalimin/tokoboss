import Link from 'next/link';
import { ProductsPanel } from '@/components/catalog/ProductsPanel';
import { getCatalogCopy } from '@/lib/catalog-copy';

export const metadata = { title: 'Produk & Stok — TokoBoss' };

/**
 * Produk & Stok page (UTA-76, Story 01 web).
 *
 * Information-dense product list + right-side SKU drawer over the UTA-75
 * catalog APIs. Entry via the bottom-left ellipsis / Lainnya menu
 * (`AppNav`, global) and the home page. The drawer overlays the list so
 * list context (query, scroll, selection) is never lost.
 */
export default function ProdukPage() {
  const copy = getCatalogCopy('en');
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="produk-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="produk-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            {copy.pageTitle}
          </h1>
          <p className="text-sm text-neutral-600 mb-6">{copy.pageSubtitle}</p>
          <ProductsPanel />
          <p className="mt-6 text-center text-sm">
            <Link
              href="/"
              className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
            >
              {copy.backHomeLink}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

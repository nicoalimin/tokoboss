import Link from 'next/link';
import { ImportReviewPanel } from '@/components/imports/ImportReviewPanel';
import { getImportsCopy } from '@/lib/imports-copy';

export const metadata = { title: 'Impor Produk — TokoBoss' };

/**
 * Product import review page (UTA-78, Story 02 web).
 *
 * Review-before-create UI over the UTA-77 import APIs, entered from
 * Produk & Stok (`/produk`). The list context is a separate route on
 * purpose: review keeps its own workspace loader, batch list, and row
 * table so Produk stays the catalog source of truth.
 */
export default function ProdukImporPage() {
  const copy = getImportsCopy('en');
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="impor-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="impor-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            {copy.pageTitle}
          </h1>
          <p className="text-sm text-neutral-600 mb-6">{copy.pageSubtitle}</p>
          <ImportReviewPanel />
          <p className="mt-6 flex flex-wrap justify-center gap-4 text-center text-sm">
            <Link
              href="/produk"
              className="text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
            >
              {copy.backToProductsLink}
            </Link>
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

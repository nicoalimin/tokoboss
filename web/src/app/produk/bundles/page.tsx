import Link from 'next/link';
import { BundlesPanel } from '@/components/bundles/BundlesPanel';
import { getBundlesCopy } from '@/lib/bundles-copy';

export const metadata = { title: 'Bundles & BOM — TokoBoss' };

/**
 * Bundles & BOM page (UTA-80, Story 13 web).
 *
 * Honest BOM editor over the UTA-79 APIs: list bundle shells, open one
 * BOM detail (component SKU TokoBoss + qty + derived availability),
 * create / replace / archive lines. Entry from Produk (`/produk` link
 * below) and from the SKU drawer ("Open in Bundles" deep-link with
 * `?workspaceId=&bundleVariantId=`); the drawer stays the SKU source of
 * truth for variant ids.
 *
 * RBAC is chrome only (Manager/Admin write); the server stays the
 * boundary. Out of scope: sell-time deduct UI, HPP rollup, marketplace
 * listing create, API contract changes.
 */
export default async function BundlesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; bundleVariantId?: string }>;
}) {
  const copy = getBundlesCopy('en');
  const params = await searchParams;
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="bundles-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="bundles-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            {copy.pageTitle}
          </h1>
          <p className="text-sm text-neutral-600 mb-6">{copy.pageSubtitle}</p>
          <BundlesPanel
            initialWorkspaceId={params.workspaceId ?? ''}
            initialBundleVariantId={params.bundleVariantId ?? ''}
          />
          <p className="mt-6 flex flex-wrap justify-center gap-4 text-center text-sm">
            <Link
              href="/produk"
              data-testid="bundles-back-products"
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

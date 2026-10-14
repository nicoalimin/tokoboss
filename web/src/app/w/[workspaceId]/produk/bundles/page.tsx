import Link from 'next/link';
import { BundlesPanel } from '@/components/bundles/BundlesPanel';
import { getBundlesCopy } from '@/lib/bundles-copy';

export const metadata = { title: 'Bundles & BOM — TokoBoss' };

/**
 * Workspace Bundles & BOM page (US29 / RFC 02 row 46). The `/w/[workspaceId]`
 * layout enforces membership; the path workspace seeds BundlesPanel. Legacy
 * `/produk/bundles` stays until middleware (row 60) redirects it.
 */
export default async function WorkspaceBundlesPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ bundleVariantId?: string }>;
}>) {
  const { workspaceId } = await params;
  const { bundleVariantId } = await searchParams;
  const base = `/w/${encodeURIComponent(workspaceId)}`;
  const copy = getBundlesCopy('en');
  const linkClass =
    'text-secondary-700 underline underline-offset-2 hover:text-secondary-800';
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
            initialWorkspaceId={workspaceId}
            initialBundleVariantId={bundleVariantId ?? ''}
          />
          <p className="mt-6 flex flex-wrap justify-center gap-4 text-center text-sm">
            <Link
              href={`${base}/produk`}
              data-testid="bundles-back-products"
              className={linkClass}
            >
              {copy.backToProductsLink}
            </Link>
            <Link href={`${base}/dashboard`} className={linkClass}>
              {copy.backHomeLink}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

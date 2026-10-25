import Link from 'next/link';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationStoreDetailCopy } from '@/lib/integration-store-detail-copy';

/**
 * Store detail fallback states (US20 / RFC 04 task 122e-i, CoS split of
 * 122e): not found (unknown or removed store, never hints at another
 * workspace) with Kembali ke Pusat integrasi; a failed read (the route's
 * client-safe message) with Coba lagi; otherwise loading. Presentational;
 * the 122e-ii loader passes the 122a hook state.
 */

export interface IntegrationStoreFallbackProps {
  workspaceId: string;
  notFound: boolean;
  error: string | null;
  onRetry: () => void;
  lang?: IntegrationLang;
}

export function IntegrationStoreFallback({
  workspaceId,
  notFound,
  error,
  onRetry,
  lang = 'id',
}: Readonly<IntegrationStoreFallbackProps>) {
  const copy = getIntegrationStoreDetailCopy(lang);
  if (notFound) {
    return (
      <div data-testid="integration-store-not-found" className="space-y-2">
        <h2 className="text-base font-semibold text-neutral-900">
          {copy.notFoundTitle}
        </h2>
        <p className="text-sm text-neutral-600">{copy.notFoundBody}</p>
        <Link
          href={`/w/${encodeURIComponent(workspaceId)}/integrasi`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          {copy.backToCenter}
        </Link>
      </div>
    );
  }
  if (error) {
    return (
      <div
        role="alert"
        data-testid="integration-store-error"
        className="rounded-lg border border-error-200 bg-error-50 p-4 text-sm text-error-800"
      >
        <p>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-[44px] rounded-lg border border-error-300 bg-white px-4 py-2 font-semibold hover:bg-error-100"
        >
          {copy.retry}
        </button>
      </div>
    );
  }
  return (
    <p role="status" className="text-sm text-neutral-600">
      {copy.loading}
    </p>
  );
}

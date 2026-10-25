import Link from 'next/link';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationStoreDetailCopy } from '@/lib/integration-store-detail-copy';

/**
 * Store detail breadcrumb (US20 / RFC 04 task 122f-i, CoS split of 122f):
 * Pusat integrasi (link to `/w/<workspaceId>/integrasi`) / current page
 * title (`aria-current="page"`). Server-safe (no hooks); page 122f-ii
 * renders it above the page `h1`.
 */

export interface IntegrationStoreBreadcrumbProps {
  workspaceId: string;
  title: string;
  lang?: IntegrationLang;
}

export function IntegrationStoreBreadcrumb({
  workspaceId,
  title,
  lang = 'id',
}: Readonly<IntegrationStoreBreadcrumbProps>) {
  const copy = getIntegrationStoreDetailCopy(lang);
  const center = `/w/${encodeURIComponent(workspaceId)}/integrasi`;
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm text-neutral-600">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            href={center}
            data-testid="store-detail-center-link"
            className="inline-flex min-h-11 items-center text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
          >
            {copy.centerLink}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">{title}</li>
      </ol>
    </nav>
  );
}

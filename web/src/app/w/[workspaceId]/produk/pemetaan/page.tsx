import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  SkuMappingOverviewQuerySchema,
  type SkuMappingOverviewQuery,
} from '@tokoboss/contracts';
import { CORRELATION_ID_HEADER } from '@tokoboss/observability';
import { SkuMappingPanel } from '@/components/sku-mapping/SkuMappingPanel';
import { getSkuMappingCopy } from '@/lib/sku-mapping-copy';
import { requireWorkspaceMember } from '@/lib/workspace-access';

const copy = getSkuMappingCopy('id');

export const metadata = { title: `${copy.pageTitle} — TokoBoss` };

type SearchValue = string | string[] | undefined;

interface PageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, SearchValue>>;
}

/** Single-valued `?q=&filter=&connectionId=&variantId=`; invalid -> none. */
function initialFilters(
  sp: Record<string, SearchValue>
): SkuMappingOverviewQuery {
  const pick = (k: string) => (typeof sp[k] === 'string' ? sp[k] : undefined);
  const raw = {
    q: pick('q'),
    filter: pick('filter'),
    connectionId: pick('connectionId'),
    variantId: pick('variantId'),
  };
  const entries = Object.entries(raw).filter(([, v]) => v !== undefined);
  const parsed = SkuMappingOverviewQuerySchema.safeParse(
    Object.fromEntries(entries)
  );
  return parsed.success ? parsed.data : {};
}

/**
 * Petakan Store SKU page (UTA-40 / US03, RFC 05 row 40). The `/w/[workspaceId]`
 * layout enforces membership (no access -> 404); this page reads the role
 * server-side with the same gate: Admin / Manager edit, Staff read-only (the
 * API routes stay the boundary). URL filters seed SkuMappingPanel (row 39c).
 */
export default async function WorkspaceSkuMappingPage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const { workspaceId } = await params;
  const incoming = await headers();
  const access = await requireWorkspaceMember(
    new Request('http://tokoboss.internal/', { headers: incoming }),
    workspaceId,
    { correlationId: incoming.get(CORRELATION_ID_HEADER) ?? undefined }
  );
  if (!access.ok) notFound();
  const { role } = access.value.membership;
  const canEdit = role === 'admin' || role === 'manager';
  const filters = initialFilters(await searchParams);
  const base = `/w/${encodeURIComponent(workspaceId)}`;
  return (
    <main data-page="sku-mapping" className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href={`${base}/produk`}
          data-testid="sku-mapping-back-products"
          className="text-sm text-secondary-700 underline underline-offset-2 hover:text-secondary-800"
        >
          {copy.backLink}
        </Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-primary-700">
          {copy.eyebrow}
        </p>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {copy.pageTitle}
        </h1>
        <p className="mb-4 text-sm text-neutral-600">{copy.pageSubtitle}</p>
        <div
          data-testid="sku-mapping-banner"
          className="mb-6 rounded-xl bg-primary-50 px-4 py-3 text-sm text-primary-800"
        >
          <p className="font-semibold">{copy.bannerTitle}</p>
          <p>{copy.bannerBody}</p>
        </div>
        <SkuMappingPanel
          workspaceId={workspaceId}
          canEdit={canEdit}
          initialFilters={filters}
        />
      </div>
    </main>
  );
}

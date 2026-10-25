import { IntegrationStoreBreadcrumb } from '@/components/integrations/IntegrationStoreBreadcrumb';
import { IntegrationStoreLoader } from '@/components/integrations/IntegrationStoreLoader';
import { parseIntegrationCallbackResult } from '@/lib/integration-problem-views';

const TITLE = 'Detail toko';

export const metadata = { title: `${TITLE} \u2014 TokoBoss` };

interface PageProps {
  params: Promise<{ workspaceId: string; connectionId: string }>;
  searchParams: Promise<{ result?: string | string[] }>;
}

/**
 * Workspace store detail page (US20 / RFC 04 task 122f-ii, last of the CoS
 * split of row 122). The `/w/[workspaceId]` layout enforces membership (no
 * access -> 404). Reads `?result=` from the OAuth callback redirect with the
 * 102b parser (unknown, empty or repeated -> null) and renders the Pusat
 * integrasi breadcrumb (122f-i), the page `h1` and the client loader
 * (122e-ii), which loads the store and the role and picks the screen by
 * status and `result`. The API routes stay the boundary.
 */
export default async function WorkspaceIntegrasiStorePage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const { workspaceId, connectionId } = await params;
  const { result } = await searchParams;
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <IntegrationStoreBreadcrumb workspaceId={workspaceId} title={TITLE} />
        <h1 className="mb-4 text-xl font-bold text-neutral-900">{TITLE}</h1>
        <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8">
          <IntegrationStoreLoader
            workspaceId={workspaceId}
            connectionId={connectionId}
            result={parseIntegrationCallbackResult(result)}
          />
        </section>
      </div>
    </main>
  );
}

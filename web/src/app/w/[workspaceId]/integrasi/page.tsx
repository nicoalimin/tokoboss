import { IntegrationCenterLoader } from '@/components/integrations/IntegrationCenterLoader';

export const metadata = { title: 'Pusat integrasi — TokoBoss' };

/**
 * Workspace Integration Center page (US20 / RFC 04 task 109b, row 109). The
 * `/w/[workspaceId]` layout enforces membership (no access → 404); the client
 * loader (109a) fetches the stores and the caller's role and renders the panel
 * (108), which owns the page `h1`. Every member sees the list; only Admins get
 * connect actions, and the API routes stay the boundary.
 */
export default async function WorkspaceIntegrasiPage({
  params,
}: Readonly<{ params: Promise<{ workspaceId: string }> }>) {
  const { workspaceId } = await params;
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8">
          <IntegrationCenterLoader workspaceId={workspaceId} />
        </section>
      </div>
    </main>
  );
}

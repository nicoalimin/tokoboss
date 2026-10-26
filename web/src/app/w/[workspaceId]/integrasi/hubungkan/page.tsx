import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CORRELATION_ID_HEADER } from '@tokoboss/observability';
import { AskAdminButton } from '@/components/integrations/AskAdminButton';
import { ConnectWizard } from '@/components/integrations/ConnectWizard';
import { IntegrationStoreBreadcrumb } from '@/components/integrations/IntegrationStoreBreadcrumb';
import { ROLE_LABELS } from '@/components/shell/nav-items';
import { getIntegrationConnectCopy } from '@/lib/integration-connect-copy';
import { requireWorkspaceMember } from '@/lib/workspace-access';

const copy = getIntegrationConnectCopy('id');

export const metadata = { title: `${copy.title} — TokoBoss` };

/**
 * Connect stores page (US20 / RFC 04 task 114), mockup v2 screen 2 + screen
 * 6. The `/w/[workspaceId]` layout enforces membership (no access -> 404);
 * this page reads the caller's role server-side with the same gate. Admin ->
 * the connect wizard (113e) with the Blibli client id read server-side
 * (`BLIBLI_CLIENT_ID`, null when unset); Manager / Staff -> the read-only
 * screen 6 notice with Minta Admin (105b). The API routes stay the boundary.
 */
export default async function WorkspaceIntegrasiConnectPage({
  params,
}: Readonly<{ params: Promise<{ workspaceId: string }> }>) {
  const { workspaceId } = await params;
  const incoming = await headers();
  const access = await requireWorkspaceMember(
    new Request('http://tokoboss.internal/', { headers: incoming }),
    workspaceId,
    { correlationId: incoming.get(CORRELATION_ID_HEADER) ?? undefined }
  );
  if (!access.ok) notFound();
  const { role } = access.value.membership;
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <IntegrationStoreBreadcrumb
          workspaceId={workspaceId}
          title={copy.title}
        />
        <h1 className="mb-4 flex flex-wrap items-center gap-2 text-xl font-bold text-neutral-900">
          {copy.title}
          <span
            data-testid="connect-admin-only"
            className="rounded-full bg-secondary-100 px-2.5 py-0.5 text-xs font-medium text-secondary-800"
          >
            {copy.adminOnlyBadge}
          </span>
        </h1>
        <section className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8">
          {role === 'admin' ? (
            <ConnectWizard
              workspaceId={workspaceId}
              clientId={process.env.BLIBLI_CLIENT_ID ?? null}
            />
          ) : (
            <div
              data-testid="connect-non-admin"
              className="flex flex-col gap-3 rounded-xl bg-warning-50 px-4 py-3 text-sm text-warning-700"
            >
              <p>{copy.nonAdminNotice(ROLE_LABELS[role] ?? role)}</p>
              <AskAdminButton provider="marketplace" />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

import { redirect } from 'next/navigation';

/**
 * Workspace Ledger index (US29 / RFC 02 row 49). The `/w/[workspaceId]` layout
 * enforces membership. Like legacy `/ledger`, it forwards to the placeholder
 * variant, but stays inside the path workspace. Legacy `/ledger` stays until
 * middleware (row 60) redirects it.
 */
export default async function WorkspaceLedgerPage({
  params,
}: Readonly<{ params: Promise<{ workspaceId: string }> }>) {
  const { workspaceId } = await params;
  redirect(`/w/${encodeURIComponent(workspaceId)}/ledger/variant_abc123`);
}

import LedgerClient from '@/app/ledger/[variantId]/ledger-client';

/**
 * Workspace Ledger variant page (US29 / RFC 02 row 50). The `/w/[workspaceId]`
 * layout enforces membership. LedgerClient already resolves the path workspace
 * via useMembership. Imports the legacy co-located client until row 51 moves it.
 * Legacy `/ledger/[variantId]` stays until middleware (row 60) redirects it.
 */
export default async function WorkspaceLedgerVariantPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string; variantId: string }>;
}>) {
  const { variantId } = await params;
  return <LedgerClient variantId={variantId} />;
}

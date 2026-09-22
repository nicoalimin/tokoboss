import { notFound } from 'next/navigation';
import LedgerClient from './ledger-client';
import { requireWorkspaceMember } from '@/lib/catalog';

export default async function LedgerPage({
  params,
}: {
  params: Promise<{ variantId: string }>;
}) {
  const { variantId } = await params;

  // Verify the user has access to this workspace and variant
  try {
    const member = await requireWorkspaceMember();
    if (!member.ok) {
      return notFound();
    }

    // Here you would typically validate that the user can access this specific variant
    // For now, we'll assume access is okay if they're in a valid workspace

    return (
      <LedgerClient
        variantId={variantId}
        warehouseId={undefined}
        memberRole={member.value.role}
      />
    );
  } catch (error) {
    console.error('Error accessing ledger:', error);
    return notFound();
  }
}

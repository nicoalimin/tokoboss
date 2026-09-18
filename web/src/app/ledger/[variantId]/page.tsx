'use client';

import LedgerClient from './ledger-client';

export default function LedgerPage({
  params,
}: {
  params: { variantId: string };
}) {
  return <LedgerClient variantId={params.variantId} />;
}
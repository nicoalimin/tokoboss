import { LedgerClient } from './ledger-client'

export default async function Page({
  params,
}: {
  params: Promise<{ variantId: string }>
}) {
  const { variantId } = await params
  return <LedgerClient variantId={variantId} />
}

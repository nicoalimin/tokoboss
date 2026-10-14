import { TransfersPanel } from '@/components/transfer/TransfersPanel';

export const metadata = { title: 'Transfer — TokoBoss' };

/**
 * Workspace Transfer page (US29 / RFC 02 row 52). The `/w/[workspaceId]`
 * layout enforces membership; TransfersPanel resolves the path workspace via
 * useMembership. Legacy `/transfer` stays until middleware (row 60) redirects
 * it.
 */
export default function WorkspaceTransferPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="transfer-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="transfer-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            Transfer antar gudang
          </h1>
          <p className="text-sm text-neutral-600 mb-6">
            Lihat riwayat transfer, buat draft, kirim, dan terima transfer antar
            gudang.
          </p>
          <TransfersPanel />
        </section>
      </div>
    </main>
  );
}

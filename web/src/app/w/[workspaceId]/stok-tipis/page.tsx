import { ReplenishPanel } from '@/components/replenish/ReplenishPanel';

export const metadata = { title: 'Stok tipis — TokoBoss' };

/**
 * Workspace Stok tipis (Replenish) page (US29 / RFC 02 row 53). The
 * `/w/[workspaceId]` layout enforces membership. A DRAFT PO is never sent to a
 * supplier here. Legacy `/stok-tipis` stays until middleware (row 60)
 * redirects it.
 */
export default function WorkspaceStokTipisPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="stok-tipis-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="stok-tipis-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            Stok tipis
          </h1>
          <p className="text-sm text-neutral-600 mb-6">
            Lihat SKU yang hampir habis, sembunyikan atau tunda, lalu buat draft
            PO dari baris yang dipilih.
          </p>
          <ReplenishPanel />
        </section>
      </div>
    </main>
  );
}

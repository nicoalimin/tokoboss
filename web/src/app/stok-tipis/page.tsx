import { ReplenishPanel } from '@/components/replenish/ReplenishPanel';

export const metadata = { title: 'Stok tipis — TokoBoss' };

/**
 * Stok tipis (Replenish) page — low-stock list + draft-PO (UTA-147 slice 3h).
 *
 * Server page that wraps the client panel. A DRAFT PO is never sent to a
 * supplier here; send/receive stays in Story 10.
 */
export default function StokTipisPage() {
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

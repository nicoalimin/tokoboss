import { WarehousesPanel } from '@/components/gudang/WarehousesPanel';

export const metadata = { title: 'Gudang — TokoBoss' };

/**
 * Gudang (Warehouse) page — read-only warehouse list (UTA-135).
 *
 * Server page that wraps a small client panel. No create/edit/transfer
 * UI in this slice.
 */
export default function GudangPage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="gudang-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="gudang-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            Daftar Gudang
          </h1>
          <p className="text-sm text-neutral-600 mb-6">
            Melihat daftar gudang untuk workspace Anda.
          </p>
          <WarehousesPanel />
        </section>
      </div>
    </main>
  );
}

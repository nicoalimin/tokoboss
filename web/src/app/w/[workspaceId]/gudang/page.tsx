import { WarehousesPanel } from '@/components/gudang/WarehousesPanel';

export const metadata = { title: 'Gudang — TokoBoss' };

/**
 * Workspace Gudang (Warehouse) page (US29 / RFC 02 row 48). The
 * `/w/[workspaceId]` layout enforces membership; WarehousesPanel resolves the
 * path workspace via useMembership. Legacy `/gudang` stays until middleware
 * (row 60) redirects it.
 */
export default function WorkspaceGudangPage() {
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
            Lihat dan kelola gudang workspace Anda (tambah, ubah nama,
            nonaktifkan/aktifkan).
          </p>
          <WarehousesPanel />
        </section>
      </div>
    </main>
  );
}

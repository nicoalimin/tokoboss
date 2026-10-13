import { PilihWorkspaceClient } from '@/components/workspace/PilihWorkspaceClient';

export const metadata = { title: 'Pilih workspace — TokoBoss' };

/** US29 / RFC 02 row 39 — account-session picker (max-w-xl ≈ mockup 560px). */
export default async function PilihWorkspacePage({
  searchParams,
}: {
  searchParams?: Promise<{ highlight?: string; next?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="pilih-workspace-title"
          className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-md sm:p-8"
        >
          <h1
            id="pilih-workspace-title"
            className="mb-1 text-2xl font-semibold text-neutral-900"
          >
            Pilih workspace
          </h1>
          <p className="mb-6 text-sm text-neutral-600">
            Pilih workspace yang ingin kamu buka.
          </p>
          <PilihWorkspaceClient
            highlight={params.highlight?.trim() || null}
            next={params.next?.trim() || null}
          />
        </section>
      </div>
    </main>
  );
}

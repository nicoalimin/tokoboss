import Link from 'next/link';

/**
 * Neutral workspace no-access screen (US29 / RFC 02 row 36).
 *
 * Rendered by `/w/[workspaceId]` layout (row 37) for every no-access case:
 * malformed/unknown id, never a member, deactivated membership, or
 * deactivated workspace. Same copy for all — no enumeration. The picker
 * link is `/pilih-workspace` (row 39). Role denials stay on `NoAccess` (403).
 */
export function WorkspaceNotAvailable() {
  return (
    <div
      role="alert"
      data-testid="workspace-not-available"
      className="mx-auto max-w-md rounded-xl border border-warning-200 bg-warning-50 px-4 py-6 text-center"
    >
      <p className="text-sm font-semibold text-warning-700">
        Akses kamu ke workspace ini tidak aktif
      </p>
      <p className="mt-1 text-sm text-neutral-700">
        Workspace tidak tersedia. Pilih workspace lain atau hubungi Admin.
      </p>
      <p className="mt-4">
        <Link
          href="/pilih-workspace"
          data-testid="workspace-not-available-picker"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-primary-500 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-600"
        >
          Pilih workspace
        </Link>
      </p>
    </div>
  );
}

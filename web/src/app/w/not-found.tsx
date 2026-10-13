import { WorkspaceNotAvailable } from '@/components/workspace/WorkspaceNotAvailable';

/**
 * US29 / RFC 02 row 37b — neutral 404 boundary for `/w/<id>/…`.
 *
 * Catches `notFound()` from the `/w/[workspaceId]` layout (row 37), so every
 * no-access case returns HTTP 404 with the same `WorkspaceNotAvailable`
 * screen (row 36). Unknown non-workspace routes keep Next's default 404.
 */
export default function WorkspaceNotFound() {
  return (
    <main className="px-4 py-10">
      <WorkspaceNotAvailable />
    </main>
  );
}

import { getTeamCopy } from '@/lib/team-copy';
import { TeamPanel } from '@/components/team/TeamPanel';

export const metadata = { title: 'Team & Access — TokoBoss' };

/**
 * Workspace Tim & Akses page (US29 / RFC 02 row 54). The `/w/[workspaceId]`
 * layout enforces membership. Legacy `/team` stays until middleware (row 60)
 * redirects it.
 */
export default function WorkspaceTeamPage() {
  const copy = getTeamCopy('en');
  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center mb-6">
          <p className="text-2xl font-bold text-neutral-900">TokoBoss</p>
        </div>
        <section
          aria-labelledby="team-title"
          className="rounded-2xl border border-neutral-200 bg-neutral-50 p-6 shadow-md sm:p-8"
        >
          <h1
            id="team-title"
            className="text-2xl font-semibold text-neutral-900 mb-1"
          >
            {copy.teamTitle}
          </h1>
          <p className="text-sm text-neutral-600 mb-6">{copy.teamSubtitle}</p>
          <TeamPanel />
        </section>
      </div>
    </main>
  );
}

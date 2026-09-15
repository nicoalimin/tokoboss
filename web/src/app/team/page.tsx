import { getTeamCopy } from '@/lib/team-copy';
import { TeamPanel } from '@/components/team/TeamPanel';

export const metadata = { title: 'Team & Access — TokoBoss' };

/**
 * Tim & Akses page (UTA-71, Story 19).
 *
 * Admin-only management UI over the UTA-70 invite/membership APIs. Wide
 * card layout (tables need more room than the narrow `AuthShell`); styling
 * honors the shared design tokens via Tailwind.
 */
export default function TeamPage() {
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

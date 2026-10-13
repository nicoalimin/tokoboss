import type { AccessibleWorkspaceView } from '@tokoboss/contracts';
import { roleCardTones } from '@/lib/role-matrix';

/**
 * One workspace card (US29 / RFC 02 row 38).
 *
 * Used by `/pilih-workspace` (row 39) and the switcher (row 40). Shows the
 * initials badge, name, role (text, never color-only), warehouse scope and
 * last-active time from `AccessibleWorkspaceView` (row 28). Presentational:
 * the parent decides navigation via `onSelect`. `highlighted` marks
 * `?highlight=<id>` (e.g. a just-accepted invite); `current` marks the
 * workspace the user is in now.
 */

const ROLE_LABEL: Record<AccessibleWorkspaceView['role'], string> = {
  admin: 'Admin',
  manager: 'Manajer',
  staff: 'Staf',
};

function lastActiveLabel(lastActiveAt: string | null): string {
  if (lastActiveAt === null) return 'Belum pernah dibuka';
  const when = new Date(lastActiveAt).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `Terakhir aktif ${when}`;
}

export function WorkspaceCard({
  workspace,
  onSelect,
  highlighted = false,
  current = false,
  disabled = false,
}: Readonly<{
  workspace: AccessibleWorkspaceView;
  onSelect: (workspaceId: string) => void;
  highlighted?: boolean;
  current?: boolean;
  disabled?: boolean;
}>) {
  const tones = roleCardTones(workspace.role);
  const ring = highlighted
    ? 'border-primary-500 ring-2 ring-primary-200'
    : 'border-neutral-200 hover:border-primary-300';
  return (
    <button
      type="button"
      data-testid={`workspace-card-${workspace.workspaceId}`}
      data-highlighted={highlighted ? 'true' : undefined}
      aria-current={current ? 'true' : undefined}
      disabled={disabled}
      onClick={() => onSelect(workspace.workspaceId)}
      className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left disabled:opacity-60 ${ring}`}
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-sm font-semibold text-primary-800"
      >
        {workspace.initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-neutral-900">
          {workspace.name}
        </span>
        <span className="mt-0.5 block truncate text-xs text-neutral-600">
          {workspace.warehouseScopeLabel} ·{' '}
          {lastActiveLabel(workspace.lastActiveAt)}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${tones.card} ${tones.text}`}
      >
        {ROLE_LABEL[workspace.role]}
      </span>
      {current ? (
        <span className="shrink-0 text-sm text-primary-600">
          ✓<span className="sr-only"> Workspace aktif</span>
        </span>
      ) : null}
    </button>
  );
}

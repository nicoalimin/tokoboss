import { canManageTeam, canViewBilling } from '@/lib/role-matrix';

/**
 * Section-preserving switch target (US29 / RFC 02 row 40).
 *
 * `/w/<current>/<section>/…` → `/w/<next>/<section>` when the target role may
 * open that section, otherwise `/w/<next>/dashboard`. Only the top-level
 * section is kept (deeper segments are workspace-specific ids). Pure and
 * UI-safe; the `/w/[workspaceId]` layout stays the security boundary.
 */

const SECTION_GATES: Readonly<Record<string, (role: string) => boolean>> = {
  team: canManageTeam,
  billing: canViewBilling,
};

const SECTION_RE = /^\/w\/[^/]+\/([a-z][a-z-]*)(?:[/?#]|$)/;

export function switchTarget(
  pathname: string | null | undefined,
  nextWorkspaceId: string,
  nextRole: string
): string {
  const base = `/w/${encodeURIComponent(nextWorkspaceId)}`;
  const section = SECTION_RE.exec(pathname ?? '')?.[1];
  if (!section) return `${base}/dashboard`;
  const gate = SECTION_GATES[section];
  if (gate && !gate(nextRole)) return `${base}/dashboard`;
  return `${base}/${section}`;
}

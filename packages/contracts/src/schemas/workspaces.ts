import { z } from 'zod';

import { InviteViewSchema, WorkspaceRoleSchema } from './invites';

/**
 * Workspace list + neutral no-access wire contracts (US29 / RFC 02 row 28).
 * Server enforces membership and tenant status; these schemas gate responses.
 */

/** One accessible workspace row for picker / switcher / GET /api/me/workspaces. */
export const AccessibleWorkspaceViewSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  initials: z.string().min(1).max(2),
  role: WorkspaceRoleSchema,
  warehouseScopeLabel: z.string().min(1),
  lastActiveAt: z.string().datetime().nullable(),
});
export type AccessibleWorkspaceView = z.infer<
  typeof AccessibleWorkspaceViewSchema
>;

/** GET /api/me/workspaces — accessible workspaces + pending invites for the account. */
export const MeWorkspacesResponseSchema = z.object({
  workspaces: z.array(AccessibleWorkspaceViewSchema),
  pendingInvites: z.array(InviteViewSchema),
});
export type MeWorkspacesResponse = z.infer<typeof MeWorkspacesResponseSchema>;

/**
 * Neutral no-access body for HTTP 404 on /w/<id>/… and /api/workspaces/[id]/….
 * Flat shape per RFC 02 (not the nested ApiResponse error envelope).
 */
export const WorkspaceNotAvailableErrorSchema = z.object({
  error: z.literal('Workspace tidak tersedia.'),
  errorCode: z.literal('WORKSPACE_NOT_AVAILABLE'),
});
export type WorkspaceNotAvailableError = z.infer<
  typeof WorkspaceNotAvailableErrorSchema
>;

export const WORKSPACE_NOT_AVAILABLE_CODE = 'WORKSPACE_NOT_AVAILABLE' as const;
export const WORKSPACE_NOT_AVAILABLE_MESSAGE =
  'Workspace tidak tersedia.' as const;

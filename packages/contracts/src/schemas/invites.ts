import { z } from 'zod';

/**
 * Invite + membership wire contracts (UTA-70). Server-side only validation —
 * these schemas gate Route Handler bodies; RBAC, the last-Admin invariant,
 * and warehouse-scope rules are enforced in `@tokoboss/application`, never
 * just here. Tokens/hashes are never logged; audit payloads carry opaque
 * ids only.
 */

export const WorkspaceRoleSchema = z.enum(['admin', 'manager', 'staff']);
export type WorkspaceRoleWire = z.infer<typeof WorkspaceRoleSchema>;

/** POST /api/workspaces/:workspaceId/invites (Admin-only) */
export const CreateInviteBodySchema = z.object({
  email: z.string().email(),
  role: WorkspaceRoleSchema,
  warehouseScope: z.string().min(1).max(120).nullable().optional(),
  /** Lifetime override in ms (default 7d, capped at 30d server-side). */
  ttlMs: z
    .number()
    .int()
    .positive()
    .max(30 * 24 * 60 * 60 * 1000)
    .optional(),
});
export type CreateInviteBody = z.infer<typeof CreateInviteBodySchema>;

/** POST /api/invites/accept (token-gated, no session required) */
export const AcceptInviteBodySchema = z.object({
  token: z.string().min(1),
  userId: z.string().min(1).max(120).optional(),
  newPassword: z.string().min(8).max(512).optional(),
});
export type AcceptInviteBody = z.infer<typeof AcceptInviteBodySchema>;

/** PATCH /api/workspaces/:workspaceId/members/:userId (Admin-only) */
export const UpdateMemberBodySchema = z
  .object({
    role: WorkspaceRoleSchema.optional(),
    warehouseScope: z.string().min(1).max(120).nullable().optional(),
  })
  .refine(
    (v) => v.role !== undefined || v.warehouseScope !== undefined,
    'Nothing to update.'
  );
export type UpdateMemberBody = z.infer<typeof UpdateMemberBodySchema>;

/** Client-safe invite projection (no token hash, no raw token). */
export const InviteViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  email: z.string().email(),
  role: WorkspaceRoleSchema,
  warehouseScope: z.string().nullable(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  expiresAt: z.string().datetime(),
  invitedBy: z.string().nullable(),
  acceptedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type InviteView = z.infer<typeof InviteViewSchema>;

/** Client-safe member projection (opaque ids only, no PII). */
export const MemberViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  role: WorkspaceRoleSchema,
  warehouseScope: z.string().nullable(),
  status: z.enum(['active', 'deactivated']),
  authVersion: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MemberView = z.infer<typeof MemberViewSchema>;

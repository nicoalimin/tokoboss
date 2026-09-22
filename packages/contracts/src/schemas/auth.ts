import { z } from 'zod';

/**
 * Password-auth wire contracts (UTA-67). Server-side only validation —
 * these schemas gate Route Handler bodies; the password *policy* (min 8 +
 * denylist) is enforced in `@tokoboss/application`, never just here.
 */

/** Client platform: drives idle TTL (web 30m / mobile 7d). */
export const AuthPlatformSchema = z.enum(['web', 'mobile']);
export type AuthPlatformWire = z.infer<typeof AuthPlatformSchema>;

/** POST /api/auth/sign-in */
export const AuthSignInBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  workspaceId: z.string().min(1),
  platform: AuthPlatformSchema.default('web'),
  deviceLabel: z.string().max(120).optional(),
});
export type AuthSignInBody = z.infer<typeof AuthSignInBodySchema>;

/** POST /api/auth/bootstrap-users (server-secret protected). */
export const AuthBootstrapUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  workspaceName: z.string().trim().min(1).max(120).optional(),
});
export type AuthBootstrapUserBody = z.infer<typeof AuthBootstrapUserBodySchema>;

/** Client-safe session projection (no hashes, no tokens). */
export const AuthSessionViewSchema = z.object({
  id: z.string().min(1),
  platform: AuthPlatformSchema,
  deviceLabel: z.string().nullable(),
  authVersion: z.number().int(),
  lastSeenAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type AuthSessionView = z.infer<typeof AuthSessionViewSchema>;

/** POST /api/auth/password-reset/request */
export const PasswordResetRequestBodySchema = z.object({
  email: z.string().email(),
});
export type PasswordResetRequestBody = z.infer<
  typeof PasswordResetRequestBodySchema
>;

/** POST /api/auth/password-reset/confirm (policy enforced server-side). */
export const PasswordResetConfirmBodySchema = z.object({
  resetToken: z.string().min(1),
  newPassword: z.string().min(8),
});
export type PasswordResetConfirmBody = z.infer<
  typeof PasswordResetConfirmBodySchema
>;

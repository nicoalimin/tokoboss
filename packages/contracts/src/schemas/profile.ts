import { z } from 'zod';

/**
 * Personal profile wire contracts (UTA-72). Server-side only validation —
 * these schemas gate Route Handler bodies; the password *policy* (min 8 +
 * denylist) and avatar file checks are enforced in `@tokoboss/application`,
 * never just here.
 */

/** Client-safe profile projection (no hashes, no tokens). */
export const ProfileViewSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().nullable(),
  avatarUploadId: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type ProfileViewWire = z.infer<typeof ProfileViewSchema>;

/** PATCH /api/auth/me — at least one field, no target user id. */
export const UpdateProfileBodySchema = z
  .object({
    displayName: z.string().max(80).nullable().optional(),
    avatarUploadId: z.string().min(1).max(200).nullable().optional(),
  })
  .refine(
    (body) =>
      body.displayName !== undefined || body.avatarUploadId !== undefined,
    { message: 'Nothing to update.' }
  );
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;

/** POST /api/auth/password/change */
export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(512),
});
export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;

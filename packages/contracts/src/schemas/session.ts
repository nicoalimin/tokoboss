import { z } from 'zod';

/**
 * Session contract (UTA-13).
 *
 * Mobile holds these tokens as opaque strings issued by the auth provider
 * (Clerk/Auth0/etc. — decided later). The shape is versioned here so the
 * mobile API client and session ports validate against shared contracts
 * instead of duplicating field definitions.
 */

/** Tokens persisted in platform secure storage. Never logged. */
export const SessionTokensSchema = z.object({
  accessToken: z.string().min(1).describe('Opaque access token (Bearer)'),
  refreshToken: z.string().min(1).describe('Opaque refresh token'),
  expiresAt: z.string().datetime().describe('Access-token expiry (ISO 8601)'),
  userId: z.string().min(1).describe('Opaque user id the session belongs to'),
});
export type SessionTokens = z.infer<typeof SessionTokensSchema>;

/** Sign-in request body sent to the versioned BFF route. */
export const SignInRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SignInRequest = z.infer<typeof SignInRequestSchema>;

/** Authenticated session payload returned by the BFF. */
export const SessionResponseSchema = z.object({
  success: z.literal(true),
  data: SessionTokensSchema,
  meta: z.object({
    timestamp: z.string().datetime(),
    requestId: z.string().optional(),
  }),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** Refresh request body sent to the versioned BFF route. */
export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

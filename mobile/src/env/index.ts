import { z } from 'zod';

/**
 * Mobile environment selection (UTA-13).
 *
 * - `dev`: local BFF (`http://localhost:3000` unless overridden).
 * - `staging` / `preview`: require an explicit `EXPO_PUBLIC_API_BASE_URL`
 *   so no production-like URL is ever hardcoded or guessed.
 *
 * Only `EXPO_PUBLIC_*` values are read here — they ship in the client
 * bundle, so secrets must never use this path.
 */

export const MobileEnvNameSchema = z.enum(['dev', 'staging', 'preview']);
export type MobileEnvName = z.infer<typeof MobileEnvNameSchema>;

const MobileEnvSchema = z.object({
  env: MobileEnvNameSchema,
  apiBaseUrl: z.string().url(),
  apiVersion: z.literal('v1'),
});
export type MobileEnv = z.infer<typeof MobileEnvSchema>;

export interface RawMobileEnv {
  EXPO_PUBLIC_APP_ENV?: string | undefined;
  EXPO_PUBLIC_API_BASE_URL?: string | undefined;
}

function readProcessEnv(): RawMobileEnv {
  const env = typeof process !== 'undefined' && process.env ? process.env : {};
  return {
    EXPO_PUBLIC_APP_ENV: env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_API_BASE_URL: env.EXPO_PUBLIC_API_BASE_URL,
  };
}

/**
 * Resolve and validate the mobile environment.
 * Throws a descriptive error when staging/preview has no API base URL.
 */
export function resolveMobileEnv(
  raw: RawMobileEnv = readProcessEnv()
): MobileEnv {
  const env = MobileEnvNameSchema.catch('dev').parse(raw.EXPO_PUBLIC_APP_ENV);
  const fallbackBaseUrl = env === 'dev' ? 'http://localhost:3000' : undefined;
  const apiBaseUrl = raw.EXPO_PUBLIC_API_BASE_URL ?? fallbackBaseUrl;
  return MobileEnvSchema.parse({ env, apiBaseUrl, apiVersion: 'v1' });
}

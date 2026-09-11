import { z } from 'zod';

/**
 * Environment types according to RFC 01
 * - Production: main branch deployments
 * - Staging: stable from develop/release branch
 * - Preview: PR preview deployments
 * - Local: development machines
 */
export const AppEnvironment = z.enum(['production', 'staging', 'preview', 'local']);
export type AppEnvironment = z.infer<typeof AppEnvironment>;

/**
 * Vercel-specific environment values
 */
export const VercelEnvironment = z.enum(['production', 'preview', 'development']);
export type VercelEnvironment = z.infer<typeof VercelEnvironment>;

/**
 * Public client-side environment variables (NEXT_PUBLIC_*)
 * These are embedded in the client bundle and must not contain secrets
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .optional()
    .default('http://localhost:3000')
    .describe('Public URL of the application'),
  
  NEXT_PUBLIC_APP_ENV: z
    .enum(['production', 'staging', 'preview', 'local'])
    .optional()
    .describe('Application environment displayed to users'),
});

/**
 * Server-only environment variables
 * These must NEVER be exposed to the client bundle
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Vercel deployment metadata (automatically set by Vercel)
  VERCEL_ENV: VercelEnvironment.optional().describe('Vercel environment type'),
  VERCEL_DEPLOYMENT_ID: z.string().optional().describe('Unique deployment ID from Vercel'),
  VERCEL_GIT_COMMIT_SHA: z.string().optional().describe('Git commit SHA of the deployment'),
  VERCEL_REGION: z.string().optional().describe('Vercel region where the function executes'),
  VERCEL_URL: z.string().optional().describe('Deployment URL provided by Vercel'),
  
  // Phase 0: Minimal required vars for bootstrap
  // Note: Additional secrets will be required when UTA-10 lands (Neon DB, Vercel Blob, etc.)
  APP_ENV: z
    .enum(['production', 'staging', 'preview', 'local'])
    .optional()
    .describe('Application environment override'),
});

/**
 * Production-only secrets (required only in production)
 * Preview deployments must NEVER have access to production credentials
 */
const productionSecretsSchema = z.object({
  // TODO (UTA-10): Add production database connection strings
  // DATABASE_URL: z.string().url(),
  // DATABASE_POOL_URL: z.string().url(),
  
  // TODO (UTA-10): Add production blob storage secrets
  // BLOB_READ_WRITE_TOKEN: z.string(),
  
  // TODO: Add production marketplace API keys
  // TODO: Add production billing/payment secrets
  // TODO: Add production signing keys
});

/**
 * Staging-specific secrets (optional for Phase 0)
 */
const stagingSecretsSchema = z.object({
  // TODO (UTA-10): Add staging database connection strings
  // STAGING_DATABASE_URL: z.string().url(),
});

/**
 * Discriminated environment validation
 * Different environments require different levels of secret validation
 * 
 * Note: Preview and local environments use minimal config for safety.
 * Real secrets are only required in production/staging.
 */
function createEnvSchema(env: string | undefined) {
  const baseSchema = serverEnvSchema.merge(publicEnvSchema);
  
  // In production, require all production secrets
  if (env === 'production') {
    return baseSchema.merge(productionSecretsSchema);
  }
  
  // In staging, require staging secrets
  if (env === 'staging') {
    return baseSchema.merge(stagingSecretsSchema);
  }
  
  // Preview and local can work with minimal config
  return baseSchema;
}

/**
 * Parse and validate environment variables
 * This should be called at server startup (instrumentation.ts or similar)
 */
export function validateEnv() {
  const rawEnv = process.env;
  
  // Determine which environment we're running in
  const detectedEnv = 
    rawEnv.APP_ENV || 
    (rawEnv.VERCEL_ENV === 'production' ? 'production' : 
     rawEnv.VERCEL_ENV === 'preview' ? 'preview' : 
     rawEnv.NODE_ENV === 'production' ? 'production' : 'local');
  
  const schema = createEnvSchema(detectedEnv);
  
  try {
    const parsed = schema.parse(rawEnv);
    return {
      success: true as const,
      data: parsed,
      environment: detectedEnv as AppEnvironment,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(
        (err) => `  - ${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      return {
        success: false as const,
        error: `Environment validation failed:\n${issues}`,
        environment: detectedEnv as AppEnvironment,
      };
    }
    
    return {
      success: false as const,
      error: `Unexpected validation error: ${error}`,
      environment: detectedEnv as AppEnvironment,
    };
  }
}

/**
 * Type-safe environment accessor
 * Only use this after validation has succeeded
 */
export type ValidatedEnv = z.infer<ReturnType<typeof createEnvSchema>>;

/**
 * Get public environment variables safe for client-side use
 * Only returns NEXT_PUBLIC_* variables
 */
export function getPublicEnv() {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  };
}

/**
 * Ensure no secrets leak to client
 * This is a compile-time and runtime guard
 */
export function assertNoSecretsInClient(obj: Record<string, any>) {
  const secretKeys = Object.keys(obj).filter(
    (key) => !key.startsWith('NEXT_PUBLIC_')
  );
  
  if (secretKeys.length > 0) {
    throw new Error(
      `Security violation: Server-only environment variables must not be exposed to client:\n${secretKeys.join(', ')}`
    );
  }
}

/**
 * Legacy environment variable utilities (from main stub, preserved for backward compat)
 * Type-safe environment variable access
 */

export function getEnv(key: string, defaultValue?: string): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] ?? defaultValue ?? '';
  }
  return defaultValue ?? '';
}

export function getRequiredEnv(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export function getEnvAsNumber(key: string, defaultValue: number): number {
  const value = getEnv(key);
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }
  return parsed;
}

export function getEnvAsBoolean(key: string, defaultValue: boolean): boolean {
  const value = getEnv(key);
  if (!value) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true' || value === '1';
}

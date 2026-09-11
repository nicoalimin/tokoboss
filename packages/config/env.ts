/**
 * Environment variable utilities
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

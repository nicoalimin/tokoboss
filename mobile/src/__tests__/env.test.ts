import { describe, expect, it } from 'vitest';
import { resolveMobileEnv } from '../env';

describe('mobile env selection', () => {
  it('defaults to dev against the local BFF', () => {
    expect(resolveMobileEnv({})).toMatchObject({
      env: 'dev',
      apiBaseUrl: 'http://localhost:3000',
      apiVersion: 'v1',
    });
  });

  it('honours explicit overrides', () => {
    expect(
      resolveMobileEnv({
        EXPO_PUBLIC_APP_ENV: 'preview',
        EXPO_PUBLIC_API_BASE_URL: 'https://preview.example.test',
      })
    ).toMatchObject({
      env: 'preview',
      apiBaseUrl: 'https://preview.example.test',
    });
  });

  it('refuses staging/preview without an explicit API base URL', () => {
    expect(() =>
      resolveMobileEnv({ EXPO_PUBLIC_APP_ENV: 'staging' })
    ).toThrow();
    expect(() =>
      resolveMobileEnv({ EXPO_PUBLIC_APP_ENV: 'preview' })
    ).toThrow();
  });

  it('falls back to dev on unknown env names', () => {
    expect(resolveMobileEnv({ EXPO_PUBLIC_APP_ENV: 'prod' }).env).toBe('dev');
  });
});

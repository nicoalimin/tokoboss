/**
 * Static guardrails (UTA-13 acceptance criteria as tests).
 *
 * - Mobile talks HTTP to versioned routes only: no `next/*` imports, no
 *   Server-Action markers (`'use server'`) anywhere under `mobile/app`
 *   or `mobile/src`.
 * - Session data never lands in plain storage: no `AsyncStorage` imports;
 *   the only durable session adapter imports `expo-secure-store`.
 * - Session data never lands in logs: no `console.log` of token-shaped
 *   identifiers in shipped code.
 * - Design tokens flow from `@tokoboss/design-tokens`: pastel primary is
 *   present and touch targets meet the 44/48 minimum.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { theme } from '../theme/tokens';
import { colors } from '@tokoboss/design-tokens/colors';

function packageRoot(): string {
  const cwd = process.cwd();
  return basename(cwd) === 'mobile' ? cwd : resolve(cwd, 'mobile');
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      yield* walk(full);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      yield full;
    }
  }
}

function shippedSources(): { file: string; content: string }[] {
  const root = packageRoot();
  const out: { file: string; content: string }[] = [];
  for (const dir of ['app', 'src'].map((d) => join(root, d))) {
    for (const file of walk(dir)) {
      out.push({ file, content: readFileSync(file, 'utf8') });
    }
  }
  expect(out.length).toBeGreaterThan(0);
  return out;
}

describe('mobile guardrails', () => {
  it('bans Server Actions and next/* imports from mobile', () => {
    const violations = shippedSources().filter(
      ({ content }) =>
        content.includes("'use server'") ||
        content.includes('"use server"') ||
        /from\s+['"]next[\/'"]/.test(content) ||
        /require\(\s*['"]next[\/'"]/.test(content)
    );
    expect(
      violations.map((v) => v.file),
      'mobile must use HTTP to versioned routes, never Server Actions'
    ).toEqual([]);
  });

  it('bans plain AsyncStorage for session data', () => {
    const violations = shippedSources().filter(({ content }) =>
      /from\s+['"]@react-native-async-storage\/async-storage['"]/.test(content)
    );
    expect(
      violations.map((v) => v.file),
      'session data belongs in expo-secure-store, not AsyncStorage'
    ).toEqual([]);
  });

  it('keeps the secure adapter on expo-secure-store', () => {
    const root = packageRoot();
    const adapter = readFileSync(
      join(root, 'src/session/expo-secure-store.adapter.ts'),
      'utf8'
    );
    expect(adapter).toContain('expo-secure-store');
    expect(adapter).not.toMatch(/from\s+['"]@react-native-async-storage/);
  });

  it('never console-logs token material', () => {
    const violations = shippedSources().filter(({ content }) =>
      /console\.(log|info|debug)\([^)]*(accessToken|refreshToken|Bearer)/.test(
        content
      )
    );
    expect(
      violations.map((v) => v.file),
      'tokens must never reach logs'
    ).toEqual([]);
  });

  it('consumes shared pastel tokens with large touch targets', () => {
    expect(theme.colors.primary).toBe(colors.primary[500]);
    expect(theme.touch.minIos).toBeGreaterThanOrEqual(44);
    expect(theme.touch.minAndroid).toBeGreaterThanOrEqual(48);
    expect(theme.touch.button).toBeGreaterThanOrEqual(48);
    // Compact spacing derives from the shared 4px-base scale.
    expect(theme.spacing.md).toBeLessThanOrEqual(theme.spacing.lg);
  });
});

/**
 * Auth infrastructure wiring for Route Handlers (UTA-67).
 *
 * - Stores: when `DATABASE_URL` is set, handlers use Postgres through the
 *   Drizzle auth + tenancy stores. Otherwise they fall back to process-local
 *   in-memory stores (documented local-dev/fixture mode; responses include
 *   `storage: "memory"` so fixture evidence can never be mistaken for
 *   Postgres rows).
 * - Hashing: scrypt via `ScryptPasswordHasher` in both modes.
 * - Rate limiting: process-local `SignInRateLimiter` (single-instance
 *   dev/preview semantics; a distributed limiter is a later scaling Task).
 * - Token delivery: `Authorization: Bearer <token>` (mobile + web fallback)
 *   or the HttpOnly `tb_session` cookie (web). Secrets stay server-side —
 *   tokens/hashes are never logged (observability `redact()` collapses
 *   cookie/session-like keys at the sink).
 */
import {
  DrizzleCredentialStore,
  DrizzlePasswordResetStore,
  DrizzleSessionStore,
  DrizzleTenancyAuditSink,
  DrizzleWorkspaceMemberStore,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryCredentialStore,
  InMemoryPasswordResetStore,
  InMemorySessionStore,
  InMemoryTenancyStore,
  ScryptPasswordHasher,
  SignInRateLimiter,
  addMember,
  adminContext,
  createWorkspace,
  normalizeEmail,
  validatePassword,
  validateSession,
  type AuthDeps,
  type AuthPlatform,
  type CredentialStore,
  type PasswordResetStore,
  type SessionStore,
  type TenancyAuditSink,
  type WorkspaceMemberStore,
} from '@tokoboss/application';

export const SESSION_COOKIE_NAME = 'tb_session';
export const SESSION_COOKIE_MAX_AGE_WEB = 30 * 60;

export function storageKind(): 'postgres' | 'memory' {
  return process.env['DATABASE_URL'] ? 'postgres' : 'memory';
}

function isProductionCookies(): boolean {
  return (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  );
}

/** `Set-Cookie` value for a web session (HttpOnly, SameSite=Lax). */
export function buildSessionCookie(token: string): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_WEB}`,
  ];
  if (isProductionCookies()) parts.push('Secure');
  return parts.join('; ');
}

/** Expired `Set-Cookie` value that clears the session cookie. */
export function buildClearedSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isProductionCookies()) parts.push('Secure');
  return parts.join('; ');
}

/** Bearer token preferred, `tb_session` cookie as the web fallback. */
export function extractToken(request: Request): string | null {
  return extractTokenWithSource(request)?.token ?? null;
}

/** Token plus where it arrived (cookie sessions slide the cookie). */
export function extractTokenWithSource(
  request: Request
): { token: string; viaCookie: boolean } | null {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.length > 7) {
    const bearer = auth.slice(7).trim();
    if (bearer) return { token: bearer, viaCookie: false };
  }
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name === SESSION_COOKIE_NAME) {
      try {
        const token = decodeURIComponent(part.slice(idx + 1).trim());
        if (token) return { token, viaCookie: true };
        return null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Best-effort caller ip for rate-limit keys (never logged). */
export function callerIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first || 'unknown';
}

// Singleton wiring (mirrors `@/lib/uploads`).

let dbHandle: DbHandle | null = null;
let memoryTenancy: InMemoryTenancyStore | null = null;
let memoryCredentials: InMemoryCredentialStore | null = null;
let memorySessions: InMemorySessionStore | null = null;
let memoryResets: InMemoryPasswordResetStore | null = null;
let rateLimiter: SignInRateLimiter | null = null;
const hasher = new ScryptPasswordHasher();

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

function getMemoryTenancy(): InMemoryTenancyStore {
  if (!memoryTenancy) memoryTenancy = new InMemoryTenancyStore();
  return memoryTenancy;
}

function getMemoryCredentials(): InMemoryCredentialStore {
  if (!memoryCredentials) memoryCredentials = new InMemoryCredentialStore();
  return memoryCredentials;
}

function getMemorySessions(): InMemorySessionStore {
  if (!memorySessions) memorySessions = new InMemorySessionStore();
  return memorySessions;
}

function getMemoryResets(): InMemoryPasswordResetStore {
  if (!memoryResets) memoryResets = new InMemoryPasswordResetStore();
  return memoryResets;
}

export function getRateLimiter(): SignInRateLimiter {
  if (!rateLimiter) rateLimiter = new SignInRateLimiter();
  return rateLimiter;
}

export function getCredentialStore(): CredentialStore {
  if (storageKind() === 'postgres') {
    return new DrizzleCredentialStore(getDbHandle().db);
  }
  return getMemoryCredentials();
}

export function getSessionStore(): SessionStore {
  if (storageKind() === 'postgres') {
    return new DrizzleSessionStore(getDbHandle().db);
  }
  return getMemorySessions();
}

export function getPasswordResetStore(): PasswordResetStore {
  if (storageKind() === 'postgres') {
    return new DrizzlePasswordResetStore(getDbHandle().db);
  }
  return getMemoryResets();
}

export function getMemberStore(): WorkspaceMemberStore {
  if (storageKind() === 'postgres') {
    return new DrizzleWorkspaceMemberStore(getDbHandle().db);
  }
  return getMemoryTenancy();
}

export function getAuthAudit(): TenancyAuditSink {
  if (storageKind() === 'postgres') {
    return new DrizzleTenancyAuditSink(getDbHandle().db);
  }
  return getMemoryTenancy().audit;
}

export function getAuthDeps(): AuthDeps {
  return {
    credentials: getCredentialStore(),
    sessions: getSessionStore(),
    resets: getPasswordResetStore(),
    members: getMemberStore(),
    hasher,
    audit: getAuthAudit(),
    rateLimiter: getRateLimiter(),
  };
}

export interface ValidatedRequest {
  userId: string;
  workspaceId: string;
  authVersion: number;
  platform: AuthPlatform;
  /** Opaque token (server-side only — used to slide the web cookie). */
  token: string;
  /** True when the token arrived via the `tb_session` cookie. */
  viaCookie: boolean;
}

/**
 * Validate the request's token; null when missing/invalid/idle/stale.
 * Bearer takes precedence over the cookie when both are present.
 */
export async function requireSessionToken(
  request: Request
): Promise<ValidatedRequest | null> {
  const source = extractTokenWithSource(request);
  if (!source) return null;
  const result = await validateSession(getAuthDeps(), source.token);
  if (!result) return null;
  return {
    userId: result.userId,
    workspaceId: result.workspaceId,
    authVersion: result.authVersion,
    platform: result.session.platform,
    token: source.token,
    viaCookie: source.viaCookie,
  };
}

/**
 * Refreshed `Set-Cookie` for cookie-authenticated web sessions, sliding the
 * browser cookie alongside the server idle clock. Bearer/mobile callers get
 * `undefined` (no cookie to maintain).
 */
export function slideSessionCookie(
  validated: ValidatedRequest
): string | undefined {
  if (validated.viaCookie && validated.platform === 'web') {
    return buildSessionCookie(validated.token);
  }
  return undefined;
}

// Local fixture helpers (memory mode only — never in production).

/**
 * Reset process-local auth state. Test seam for `web/src/__tests__` and
 * local fixture scripts; refuses production.
 */
export function __resetAuthForTests(): void {
  if (isProductionCookies())
    throw new Error('Refusing fixture reset in production');
  memoryTenancy = new InMemoryTenancyStore();
  memoryCredentials = new InMemoryCredentialStore();
  memorySessions = new InMemorySessionStore();
  memoryResets = new InMemoryPasswordResetStore();
  rateLimiter = new SignInRateLimiter();
}

/**
 * Seed one credential + membership in memory mode and return the workspace
 * id. Used by local fixture auth (see `packages/application/src/auth/
 * README.md`) and route tests. Refuses Postgres mode and production.
 */
export async function seedFixtureCredential(input: {
  email: string;
  password: string;
  workspaceName?: string;
  role?: 'admin' | 'manager' | 'staff';
}): Promise<{ workspaceId: string; userId: string }> {
  if (storageKind() !== 'memory' || isProductionCookies()) {
    throw new Error('Fixture seeding is memory-mode only (never production)');
  }
  const tenancy = getMemoryTenancy();
  validatePassword(input.password);
  const slug = `fixture-${Math.random().toString(36).slice(2, 8)}`;
  const adminId = `user_fixture_admin_${slug}`;
  const { workspaceId } = await createWorkspace(
    tenancy,
    tenancy,
    {
      name: input.workspaceName ?? 'Fixture Store',
      slug,
      initialAdminUserId: adminId,
    },
    tenancy.audit
  );
  const userId = `user_fixture_${slug}`;
  await addMember(
    tenancy,
    {
      ctx: adminContext(workspaceId, adminId),
      workspaceId,
      userId,
      role: input.role ?? 'admin',
      warehouseScope: null,
    },
    tenancy.audit
  );
  await getMemoryCredentials().create({
    email: normalizeEmail(input.email),
    userId,
    passwordHash: await hasher.hash(input.password),
  });
  return { workspaceId, userId };
}

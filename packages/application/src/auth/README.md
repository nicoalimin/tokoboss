# Auth (password + sessions) — UTA-67

Server-side credential + session use-cases for Story 21. No UI lives here;
web/mobile clients authenticate through `web/src/app/api/auth/*`.

## Product freeze (UTA-17, honored)

- Idle-only sessions: **web 30m / mobile 7d**, no absolute login expiry.
  Activity slides `last_seen`; idle past the window rejects the session.
- Unlimited concurrent devices; list active sessions; sign out this / all.
- Password **min 8 + common-password denylist**; no MFA/SSO.
- Revoke-all on password reset / Admin deactivate (membership
  `auth_version` bump; sessions snapshot it at sign-in).
- MVP security events via the UTA-19 `emitSecurityEvent` hook:
  `security.sign_in_succeeded`, `security.sign_in_failed` (rate-limited,
  identifier-free), `security.password_reset`, `security.forced_sign_out`.

## Layout

| File | Purpose |
| ---- | ------- |
| `auth-types.ts` | Records, idle TTLs, client-safe `SessionView` |
| `password-policy.ts` | Min 8 + denylist (`validatePassword`) |
| `crypto.ts` | scrypt hasher (stdlib-only) + token hashing/minting |
| `rate-limit.ts` | Sliding-window `SignInRateLimiter` (5 fails / 15m per email\|ip) |
| `auth-use-cases.ts` | `signIn`, `validateSession`, `signOut`, `signOutAll`, `listSessions`, `requestPasswordReset`, `confirmPasswordReset` |
| `in-memory-auth-store.ts` | Test doubles mirroring the Postgres contracts |

Postgres implementations live in
`@tokoboss/database` (`drizzle-auth-repository.ts`); the schema diff is
`infra/drizzle/0006_auth_sessions.sql` (`auth_users`, `auth_sessions`,
`auth_password_resets` — hashes only, never plaintext/tokens).

## Local fixture auth (memory mode)

With no `DATABASE_URL` set, the web routes run on process-local stores.
Seed one login (dev/test only, never production):

```ts
import { __resetAuthForTests, seedFixtureCredential } from '@/lib/auth';

__resetAuthForTests();
const { workspaceId } = await seedFixtureCredential({
  email: 'owner@fixture.test',
  password: 'sari-roti-88!',
  role: 'admin',
});
```

Then:

```bash
# web session (HttpOnly tb_session cookie)
curl -i -X POST localhost:3000/api/auth/sign-in \
  -H 'content-type: application/json' \
  -d '{"email":"owner@fixture.test","password":"sari-roti-88!","workspaceId":"<ws>","platform":"web"}'

# mobile session (bearer token in JSON)
curl -X POST localhost:3000/api/auth/sign-in \
  -H 'content-type: application/json' \
  -d '{"email":"owner@fixture.test","password":"sari-roti-88!","workspaceId":"<ws>","platform":"mobile"}'

curl localhost:3000/api/auth/sessions -H "authorization: Bearer <token>"
```

Password-reset tickets need a mailer in production; locally pass
`AUTH_INCLUDE_RESET_TOKEN=true` to receive the single-use ticket in the
request response, then POST it to `/api/auth/password-reset/confirm`.

## Safety rules

- Stores persist **hashes only** (`password_hash` scrypt, `token_hash`
  sha256). Opaque tokens are returned once and never logged.
- Failure responses are generic (`Invalid email or password.`) — unknown
  email, wrong password, and missing/deactivated membership are
  indistinguishable. Audit payloads carry opaque ids only.

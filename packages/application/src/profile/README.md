# Personal profile — UTA-72

API-only personal profile for Story 25. No UI lives here; web/mobile
clients use `web/src/app/api/auth/me` + `/api/auth/password/change`.
Builds on UTA-67 auth (session validation, password policy, revoke-all)
and the UTA-19 tenancy baseline (opaque ids, audit-payload safety).

## Layout

| File                         | Purpose                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `profile-types.ts`           | `ProfileRecord`, client-safe `ProfileView`, display-name limit (80) |
| `profile-errors.ts`          | `ProfileValidationError` (400), `ProfileForbiddenError` (403)       |
| `profile-ports.ts`           | `ProfileStore` (`findByUserId`, `upsert`)                           |
| `profile-use-cases.ts`       | `getMe`, `updateProfile`, `changePassword`                          |
| `in-memory-profile-store.ts` | Test double mirroring the Postgres contract                         |

Postgres lives in `@tokoboss/database` (`drizzle-profile-repository.ts`);
the schema diff is `infra/drizzle/0008_user_profiles.sql` (`user_profiles`
— one row per opaque `user_id`, avatar is a `file_uploads.id` reference
with `SET NULL`, never bytes or URLs).

## Routes

- `GET /api/auth/me` — read own profile (defaults when never set, no
  write on read). Slides the session cookie for cookie callers.
- `PATCH /api/auth/me` — update own `displayName` (trimmed 1..80, never
  an email) and/or `avatarUploadId` (must be a `completed` image
  `file_uploads` row in the caller's workspace, e.g. purpose `avatar`
  via `/api/uploads/token`). No target-user param — cross-user updates
  are structurally impossible.
- `POST /api/auth/password/change` — verify current password, enforce
  min-8 + denylist, rotate the hash, revoke ALL sessions (response clears
  the web cookie), bump every membership `auth_version`, emit
  `security.password_change` + `security.forced_sign_out`
  (`password_change`) — the UTA-17 reset-flow parity.

## Avatar uploads (private Blob)

```bash
# 1. issue a token (purpose avatar, image/*, ≤5 MB)
curl -X POST localhost:3000/api/uploads/token \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: <ws>' -H 'x-role: admin' \
  -d '{"purpose":"avatar","filename":"me.png","contentType":"image/png","byteSize":12345}'

# 2. PUT bytes to uploadUrl, then POST /api/uploads/complete
# 3. link it
curl -X PATCH localhost:3000/api/auth/me \
  -H "authorization: Bearer <token>" -H 'content-type: application/json' \
  -d '{"avatarUploadId":"<uploadId>"}'
```

## Safety rules

- Responses carry the caller's own email + profile fields only — never
  password hashes, session tokens, or other users' data.
- Logs carry route names (and revoke counts) only — never passwords,
  display names, emails, or avatar references verbatim.
- Audit payloads carry opaque ids only (`workspaceId`, `userId`,
  `reason`); `assertTenancyPayloadSafe` rejects secrets/PII at the
  `emitSecurityEvent` boundary.

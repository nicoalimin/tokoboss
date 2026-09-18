# Tenancy + audit baseline (UTA-19) — how later WS1 tickets use it

Parent freeze: [UTA-17](https://linear.app/utamas/issue/UTA-17/spikeprd-review-auth-session-policy-rbac-roles-for-mvp)
(session policy + RBAC). This module is the durable baseline for sign-in,
invites, and settings work.

## Model

- A **workspace IS the tenant**: `workspace_id → tenants.id` (same convention
  as `jobs.workspace_id`, `file_uploads.workspace_id`). No second tenancy stack.
- `workspace_members`: one row per `(workspace_id, user_id)`.
  `user_id` is an **opaque** auth-provider id (never email/name).
  `role` ∈ `admin | manager | staff`; `warehouse_scope` is an opaque warehouse
  id or `null` (Admin must be `null`); `status` ∈ `active | deactivated`;
  `auth_version` starts at 1 and **bumps on every role/scope/status change**
  (session invalidation — see `session-policy.ts` in `@tokoboss/auth`).
- `audit_events` (+ UTA-19 columns `actor_type`, `actor_id`, `category`,
  `correlation_id`): append-only. Categories: `membership | workspace |
security`. Payloads carry opaque ids only.

## Rules for route/use-case authors

1. **Never trust the client workspace id.** Authenticate → `resolveWorkspaceContext(store, { requestedWorkspaceId, userId })`
   (server-side membership lookup) → `assertSameWorkspace(ctx, target)` (deny-by-default,
   `TenancyForbiddenError`, indistinguishable from not-found).
2. **Roles**: `assertRole` / `assertManagerOrAdmin`. Membership mutations
   (`addMember`, `changeMember`, `removeMember`, `forceSignOut`) are Admin-only.
3. **Warehouses**: `assertWarehouseAccess(ctx, warehouseId)` — Admin bypasses;
   scoped Manager/Staff touch only their warehouse.
4. **Last Admin**: `changeMember`/`removeMember` throw `LastAdminError` when the
   workspace would be left with zero active Admins. Always load
   `listByWorkspace` and check — never trust a client count.
5. **Audit everything**: pass a `TenancyAuditSink` (`DrizzleTenancyAuditSink`
   in `@tokoboss/database`) so membership/workspace/security events persist.
   Payloads go through `assertTenancyPayloadSafe` — emails, tokens, passwords,
   phones, NIKs, blob paths are **rejected**, not redacted. Log via
   `@tokoboss/observability` (`redact()` runs on every logger call).
6. **Security hooks**: `emitSecurityEvent` covers the four MVP events
   (`security.sign_in_succeeded`, `security.sign_in_failed`,
   `security.password_reset`, `security.forced_sign_out`). Keep
   `sign_in_failed` payloads identifier-free and rate-limit at the route.
   `forceSignOut` bumps `auth_version` (revoke-all on password reset /
   Admin deactivate).

## Sessions (`@tokoboss/auth` → `session-policy.ts`)

Idle-only TTLs (`web` 30m, `mobile` 7d), no absolute expiry, unlimited devices.
`isSessionValid(claims, currentAuthVersion)` rejects idle-expired **or**
auth-stale sessions; `touchSession` refreshes the idle clock. Routes validate
against the live membership row's `auth_version`.

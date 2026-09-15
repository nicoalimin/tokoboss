# Invites + membership management (UTA-70) — API-only

Parent: [UTA-20](https://linear.app/utamas/issue/UTA-20/story-19-invite-and-manage-users)
([User Story 19](https://app.notion.com/p/157af3f002c08364baed8122396c15fb)).
Builds on tenancy [UTA-19](./README.md), auth
[UTA-67](../auth/README.md), RBAC freeze [UTA-17](https://linear.app/utamas/issue/UTA-17/spikeprd-review-auth-session-policy-rbac-roles-for-mvp).
No UI lives here (UI = separate Task after mockup).

## Model

- `workspace_invites` (`infra/drizzle/0007_workspace_invites.sql`): one row
  per ticket — `workspace_id → tenants.id`, normalized `email` (PII),
  `role` ∈ `admin|manager|staff`, nullable `warehouse_scope` (Admin must be
  `null`), `token_hash` (sha256, unique — the raw token is returned **once**
  and never stored), `status` ∈ `pending|accepted|revoked|expired`,
  `expires_at` (default 7d, cap 30d), `invited_by` (opaque user id).
- `workspace_members` unchanged: accept creates (or reactivates) the row;
  every role/scope/status change bumps `auth_version`.

## Use-cases (`invite-use-cases.ts`)

| Function                      | Gate                     | Notes                                                                                                                                                 |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createInvite`                | Admin, same workspace    | Rejects duplicate pending tickets + already-active members (`InviteConflictError`)                                                                    |
| `acceptInvite`                | token-gated (no session) | Idempotent for active members; reactivates deactivated ones (auth bump); provisions a password credential when `password` is supplied and none exists |
| `listInvites` / `listMembers` | Admin, same workspace    |                                                                                                                                                       |
| `changeMember` (update)       | Admin, same workspace    | Role/scope change bumps `auth_version`; last-active-Admin demote rejected                                                                             |
| `deactivateMember`            | Admin, same workspace    | `auth_version` bump + session rows revoked now + `security.forced_sign_out` (`admin_deactivate`); last-Admin rejected                                 |
| `revokeInvite`                | Admin, same workspace    | Pending → revoked                                                                                                                                     |

Invalid/consumed tokens are a generic `InviteInvalidError` (no oracle);
late accepts stamp the row `expired` and throw `InviteExpiredError`.

## Routes (`web/src/app/api`)

- `POST /api/workspaces/:workspaceId/invites` (Admin) → `{ invite, token }`
- `GET /api/workspaces/:workspaceId/invites` (Admin)
- `DELETE /api/workspaces/:workspaceId/invites/:inviteId` (Admin)
- `POST /api/invites/accept` (token-gated) → `{ member, userId, isNewUser, isNewMember }`
- `GET /api/workspaces/:workspaceId/members` (Admin)
- `PATCH /api/workspaces/:workspaceId/members/:userId` (Admin)
- `POST /api/workspaces/:workspaceId/members/:userId/deactivate` (Admin)

Auth resolves server-side (`requireWorkspaceAdmin`): session → membership
lookup in the **path** workspace, deny-by-default (401 no session, 403
non-member / non-Admin / cross-workspace, 409 last-Admin or duplicate,
404 invalid ticket, 410 expired).

## Safety rules

- Audit categories: `invite.*` (`created/accepted/revoked/expired`) plus the
  existing `membership.*` / `security.forced_sign_out` hooks. Payloads carry
  opaque ids (`inviteId`, `userId`, `role`, …) — **never** email or tokens
  (`assertTenancyPayloadSafe` rejects them at the boundary).
- Logs carry references (`inviteId`, `memberId`) only.
- Responses never contain `tokenHash` / `passwordHash`.

## Local try-out (memory mode, no `DATABASE_URL`)

```bash
# sign in as an Admin (see ../auth/README.md fixture seeding)
curl -X POST localhost:3000/api/auth/sign-in -H 'content-type: application/json' \
  -d '{"email":"owner@fixture.test","password":"sari-roti-88!","workspaceId":"<ws>","platform":"mobile"}'
# T=<token from above>
curl -X POST localhost:3000/api/workspaces/<ws>/invites \
  -H "authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"email":"clerk@example.test","role":"staff"}'
# I=<invite token from above>
curl -X POST localhost:3000/api/invites/accept -H 'content-type: application/json' \
  -d "{\"token\":\"$I\",\"newPassword\":\"clerk-noodles-99\"}"
curl localhost:3000/api/workspaces/<ws>/members -H "authorization: Bearer $T"
```

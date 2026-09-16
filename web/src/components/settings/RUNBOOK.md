# Settings hub + role-gated shell — runbook (UTA-74)

## What shipped

- **Settings hub** at `/pengaturan`: 7 rows (Profil, Tim & Akses live;
  Gudang, Integrasi, Bahasa, Notifikasi, Paket & Tagihan honest stubs at
  `/pengaturan/[area]`). Entry via the bottom-left `•••` / `Lainnya` menu
  (`AppNav`, global).
- **Role cards + permission matrix** (`RoleCards`, `PermissionMatrix`):
  rendered on `/pengaturan` and above the Tim & Akses management controls.
  Informational only — the server enforces every row.
- **Role-gated shell**: `GET /api/auth/membership` returns the caller's own
  `{ role, warehouseScope, status }`; `useMembership()` hides the Team &
  Access nav entry for known non-Admins; `/team` renders `NoAccess` on 403.
  Server (`requireWorkspaceAdmin`, tenancy use-cases) stays the boundary.

## Run locally

```bash
pnpm install
pnpm --filter @tokoboss/web dev   # http://localhost:3000/pengaturan
```

## Storage modes (memory vs `DATABASE_URL`)

| Mode | How | Membership source |
| --- | --- | --- |
| Memory (default, no `DATABASE_URL`) | Process-local stores; responses include `"storage": "memory"`. Fixture: `seedFixtureCredential()` + sign in. | `InMemoryTenancyStore` |
| Postgres (`DATABASE_URL` set) | Drizzle stores via `createDb()`; same route shapes, `"storage": "postgres"`. | `DrizzleWorkspaceMemberStore` |

The membership route and all team APIs behave identically across modes;
only the store changes. Tests run in memory mode:

```bash
pnpm --filter @tokoboss/web test --run src/__tests__/settings-hub.test.ts
```

## Checks

- `pnpm --filter @tokoboss/web typecheck` — must pass.
- `pnpm --filter @tokoboss/web lint` — must pass.
- New tests: `web/src/__tests__/settings-hub.test.ts` (11 tests: hub rows,
  matrix invariants, copy sync, self-membership client + route).

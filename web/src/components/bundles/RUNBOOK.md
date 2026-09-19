# Bundles/BOM UI — runbook (UTA-80)

## What shipped

- **Bundles & BOM** at `/produk/bundles`: workspace loader, bundle list
  (bundle SKU + line count + version), one-at-a-time BOM detail
  (component SKU TokoBoss + qty per line plus derived per-warehouse
  availability when the API returns it), create form (bundle variant ID +
  1–100 component lines + expected version), edit form (replaces every
  line at once with the detail's version), confirm-gated archive (clears
  lines, idempotent — no hard delete anywhere).
- **Honest errors**: `BUNDLE_CYCLE` (self-ref + transitive), duplicate
  BOM (`BUNDLE_CONFLICT`), stale versions (`BUNDLE_VERSION_CONFLICT`),
  missing BOMs (`BUNDLE_NOT_FOUND`), and bundle-stock
  (`BUNDLE_NO_DIRECT_STOCK`) surface their own sentences; nothing beyond
  the overview is invented.
- **RBAC chrome**: Manager/Admin see create + edit + archive; Staff sees
  the read-only note; 401 `INVALID_SESSION` redirects to
  `/sign-in?expired=1`; 403 renders honest no-access copy. The server
  stays the boundary.
- **Entry points**: `Manage bundles / BOM` link on `/produk` (preserves
  the workspace via `?workspaceId=`), same link at the bottom of
  `/produk`, and the SKU drawer `Bundle BOM` section with `Open in
Bundles` deep-link (`?workspaceId=&bundleVariantId=`). Drawer also
  lists the variant's BOM lines when present, empty note otherwise.
  Drawer stock adjustments on a bundle shell now show the honest
  bundle-stock sentence (catalog client maps `BUNDLE_NO_DIRECT_STOCK`).
- **Client**: `src/lib/bundles-client.ts` (`credentials: "same-origin"`);
  copy in `src/lib/bundles-copy.ts` (EN default + ID).

## Run locally

```bash
pnpm install
pnpm --filter @tokoboss/web dev   # http://localhost:3000/produk/bundles
```

## Storage modes (memory vs `DATABASE_URL`)

| Mode                                | How                                                                                                          | Bundle source          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Memory (default, no `DATABASE_URL`) | Process-local stores; responses include `"storage": "memory"`. Fixture: `seedFixtureCredential()` + sign in. | `InMemoryCatalogStore` |
| Postgres (`DATABASE_URL` set)       | Drizzle stores via `createDb()`; same route shapes, `"storage": "postgres"`.                                 | `DrizzleCatalogStore`  |

The Bundles UI behaves identically across modes; only the store changes.
Tests run in memory mode:

```bash
pnpm --filter @tokoboss/web test --run src/__tests__/bundles-ui.test.ts
```

## Manual pass (memory mode)

```bash
pnpm --filter @tokoboss/web dev
# 1. Sign in at http://localhost:3000/sign-in as a seeded user
#    (seed via `seedFixtureCredential` as in web/README.md; copy its workspace ID).
# 2. Create two products at /produk (e.g. BUNDLE-HEMAT + COMP-A), open the
#    bundle drawer once to copy variant IDs, adjust COMP-A stock in a warehouse.
# 3. Open http://localhost:3000/produk/bundles via Manage bundles / BOM,
#    paste the workspace ID, Load bundles.
# 4. Create a BOM: bundle variant ID + expected version (1 for a fresh
#    variant) + one component line (component variant ID + qty 2).
# 5. Open the BOM: components show SKU + qty; availability shows derived
#    per-warehouse bundles. Edit qty to 3, save — stale versions reject
#    with the version sentence.
# 6. Try a self-reference (component = bundle id) — the cycle sentence
#    appears. Archive the BOM (confirm) — lines clear, detail stays.
# 7. As Staff: list + detail still read; create/edit/archive hide behind
#    the read-only note (server 403 stays the boundary).
```

## Checks

- `pnpm --filter @tokoboss/web typecheck` — must pass.
- `pnpm --filter @tokoboss/web lint` — must pass.
- New tests: `web/src/__tests__/bundles-ui.test.ts` (7 tests: list/detail
  cookies, create version, update + archive, re-auth/forbidden mapping,
  cycle/conflict/version/stock honesty, no-secret errors, copy sync).

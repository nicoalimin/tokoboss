# Catalog — SKU TokoBoss API (UTA-75, Story 01)

Workspace-scoped catalog domain + API. No web UI in this workstream; no
live marketplace calls (the `catalog_channel_mappings` table is stub-ready
for Story 03–04).

## Data model (`0009_catalog_skus`)

| Table                      | Key / constraint                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog_products`         | workspace-scoped product (name, unit, pictures metadata, `active`/`archived`, `version`)                                                       |
| `catalog_variants`         | one SKU TokoBoss per row; `UNIQUE (workspace_id, sku_code)`; manual HPP (`hpp_cents`) + cost-source label; optional barcode; listing-name hint |
| `catalog_warehouses`       | workspace-scoped master data (`code` unique per workspace, `active`/`deactivated`, `version`)                                                  |
| `catalog_inventory_levels` | SoT read model, `UNIQUE (variant_id, warehouse_id)` — derived ONLY from the ledger                                                             |
| `catalog_stock_ledger`     | append-only source of truth (`delta`, `balance_after`, `reason`, actor, correlation)                                                           |
| `catalog_channel_mappings` | `UNIQUE (workspace_id, channel, shop_ext_id, platform_sku_id)` → variant; hints only                                                           |

Removal is archive-only (`status = 'archived'`, idempotent, cascaded
atomically to active variants). `DELETE` on products/variants answers
`405 CATALOG_NO_HARD_DELETE`. Channel mappings are links, not master
data: deleting one un-locks SKU code edits and never touches ledger
history.

## Freeze rules (server-side, both stores)

- Create product with **≥1 variants**; duplicate SKU → `409
CATALOG_CONFLICT` with `details.existingPath` (API path of the row).
- `skuCode` edits: **Admin only** (`403` otherwise), **locked** once the
  variant has ledger entries or mappings (`422 CATALOG_SKU_LOCKED`).
- Adjustments require **warehouse + reason + save**: one ledger entry +
  level advance per call, no server-side drafts ("pending adjustment" is a
  client-side concern). Balances can never go negative (`422
CATALOG_INSUFFICIENT_STOCK`); deactivated warehouses reject (`422
CATALOG_WAREHOUSE_INACTIVE`).
- Optimistic concurrency: `expectedVersion` on every PATCH/adjustment;
  stale writes reject with `409 CATALOG_VERSION_CONFLICT` (+
  `currentVersion`) instead of silently overwriting.
- RBAC: reads any active member; creates/updates/archives/mappings/
  warehouses Manager/Admin; adjustments any active member within
  warehouse scope (scoped Staff limited to their warehouse).

## Endpoints (all under `/api/workspaces/:workspaceId/catalog`)

`GET|POST /products` (list supports `?q=&status=&limit=`) ·
`GET|PATCH|DELETE(405) /products/:id` · `POST /products/:id/archive` ·
`GET|POST /products/:id/variants` · `GET|PATCH|DELETE(405)
…/variants/:variantId` · `POST …/variants/:id/archive` ·
`POST …/variants/:id/adjustments` · `GET …/variants/:id/ledger` ·
`GET|POST …/variants/:id/mappings` · `DELETE …/mappings/:mappingId` ·
`GET|POST /warehouses` · `PATCH /warehouses/:id` · `GET
/search?q=` (name, SKU TokoBoss, barcode, Store SKU hint, listing name).

## Runbook — memory vs `DATABASE_URL`

- **Memory mode** (no `DATABASE_URL`): route handlers use the
  process-local `InMemoryCatalogStore` (+ in-memory auth/tenancy). Used by
  `web/src/__tests__/catalog.test.ts` (reset via
  `__resetCatalogForTests` alongside `__resetAuthForTests`) and local dev.
  Responses include `"storage": "memory"` so fixture evidence is never
  mistaken for Postgres rows.
- **Postgres mode** (`DATABASE_URL` set, e.g. a Neon branch — never
  production credentials in tests): handlers use `DrizzleCatalogStore`.
  Apply migrations first (`pnpm --filter @tokoboss/database db:migrate`
  against the branch), then run the app. PGlite integration coverage lives
  in `packages/database/src/__tests__/catalog.test.ts` (applies
  `0001 → 0009` with zero Neon credentials).
- Verify: `pnpm --filter @tokoboss/application test`,
  `pnpm --filter @tokoboss/database test`, `pnpm --filter web test`,
  `pnpm typecheck`.

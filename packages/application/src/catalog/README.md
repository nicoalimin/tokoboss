# Catalog — SKU TokoBoss API (UTA-75, Story 01; UTA-81, Story 05)

Workspace-scoped catalog domain + API. No web UI in this workstream; no
live marketplace calls (the `catalog_channel_mappings` table is stub-ready
for Story 03–04).

## Data model (`0009_catalog_skus` + `0012_stock_ledger_hardening`)

| Table                      | Key / constraint                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog_products`         | workspace-scoped product (name, unit, pictures metadata, `active`/`archived`, `version`)                                                       |
| `catalog_variants`         | one SKU TokoBoss per row; `UNIQUE (workspace_id, sku_code)`; manual HPP (`hpp_cents`) + cost-source label; optional barcode; listing-name hint |
| `catalog_warehouses`       | workspace-scoped master data (`code` unique per workspace, `active`/`deactivated`, `version`)                                                  |
| `catalog_inventory_levels` | SoT read model, `UNIQUE (variant_id, warehouse_id)` — derived ONLY from the ledger                                                             |
| `catalog_stock_ledger`     | append-only source of truth (`delta`, `balance_after`, `reason`, actor, correlation, `idempotency_key` — `UNIQUE (workspace_id, idempotency_key)` where not null) |
| `catalog_stock_settings`   | one row per workspace (lazy-created, default `allow_negative = false`); Admin-only toggle, CAS-guarded `version`                               |
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
  client-side concern). Deactivated warehouses reject (`422
CATALOG_WAREHOUSE_INACTIVE`).
- **Negative stock (UTA-81):** default OFF — adjustments that would drive
  a balance below zero reject with `422 CATALOG_INSUFFICIENT_STOCK`.
  Admin may opt the workspace in via `PUT …/stock-settings`
  (`allowNegative`, CAS-guarded `expectedVersion`); Managers/Staff get
  `403` on the toggle.
- **Idempotency (UTA-81):** `POST …/adjustments` accepts an optional
  client-generated `idempotencyKey` (1–128 chars). A retried key resolves
  to the original `{ level, entry }` with `deduplicated: true` (HTTP 200
  instead of 201) — the delta is never double-applied. Reusing a key with
  a different variant/warehouse/delta/reason is `409 CATALOG_CONFLICT`.
- Optimistic concurrency: `expectedVersion` on every PATCH/adjustment/
  settings-toggle; stale writes reject with `409
  CATALOG_VERSION_CONFLICT` (+ `currentVersion`) instead of silently
  overwriting.
- RBAC: reads any active member; creates/updates/archives/mappings/
  warehouses/adjustments Manager/Admin; stock-settings toggle Admin only.
  Scoped Manager/Staff are limited to their warehouse for
  adjustments and warehouse-filtered reads (consolidated totals stay
  workspace-wide so stock truth is never hidden).

## Endpoints (all under `/api/workspaces/:workspaceId/catalog`)

`GET|POST /products` (list supports `?q=&status=&limit=`) ·
`GET|PATCH|DELETE(405) /products/:id` · `POST /products/:id/archive` ·
`GET|POST /products/:id/variants` · `GET|PATCH|DELETE(405)
…/variants/:variantId` · `POST …/variants/:id/archive` ·
`POST …/variants/:id/adjustments` (Manager/Admin; `idempotencyKey`) ·
`GET …/variants/:id/ledger` (`?warehouseId=&limit=`, any member) ·
`GET …/variants/:id/stock` (consolidated `totalQty` + per-warehouse
remaining, any member) · `GET|PUT /stock-settings` (GET any member, PUT
Admin only) · `GET|POST …/variants/:id/mappings` · `DELETE
…/mappings/:mappingId` · `GET|POST /warehouses` · `PATCH
/warehouses/:id` · `GET /search?q=` (name, SKU TokoBoss, barcode,
Store SKU hint, listing name).

Bundle/BOM endpoints (UTA-79, Story 13) live under the same prefix —
see `../bundles/README.md`: `GET|POST /bundles` · `GET|PATCH|DELETE(405)
/bundles/:bundleVariantId` · `POST …/archive`.

## Runbook — memory vs `DATABASE_URL`

- **Memory mode** (no `DATABASE_URL`): route handlers use the
  process-local `InMemoryCatalogStore` (+ in-memory auth/tenancy). Used by
  `web/src/__tests__/catalog.test.ts` (reset via
  `__resetCatalogForTests` alongside `__resetAuthForTests`) and local dev.
  Responses include `"storage": "memory"` so fixture evidence is never
  mistaken for Postgres rows. Stock settings default to
  `allowNegative: false` per workspace (lazy-created in memory);
  idempotency keys dedupe within the process.
- **Postgres mode** (`DATABASE_URL` set, e.g. a Neon branch — never
  production credentials in tests): handlers use `DrizzleCatalogStore`.
  Apply migrations first (`pnpm --filter @tokoboss/database db:migrate`
  against the branch — this includes `0012_stock_ledger_hardening`: the
  `idempotency_key` column + partial unique index and the
  `catalog_stock_settings` table), then run the app. PGlite integration
  coverage lives in `packages/database/src/__tests__/catalog.test.ts`
  (applies `0001 → 0012` with zero Neon credentials).
- Verify: `pnpm --filter @tokoboss/application test`,
  `pnpm --filter @tokoboss/database test`, `pnpm --filter web test`,
  `pnpm typecheck`.

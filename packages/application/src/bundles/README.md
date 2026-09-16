# Bundles / BOM — sellable composed SKUs (UTA-79, Story 13)

Workspace-scoped Bundle/BOM domain + API. API/domain only — no web UI in
this workstream (a separate Task owns the BOM UI), no marketplace listing
create from bundles, no deep HPP rollup (Story 15).

## Data model (`0011_bundle_bom`)

| Table                  | Key / constraint                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog_bundle_lines` | one BOM line: `(bundle_variant_id, component_variant_id)` unique; `qty` positive integer                                                                    |
| FKs                    | `bundle_variant_id → catalog_variants` `ON DELETE cascade`; `component_variant_id` `ON DELETE restrict`; both workspace-scoped via `workspace_id → tenants` |

A variant with ≥1 lines is a **bundle**; a variant with none is a plain
component SKU. SKU TokoBoss remains the identity for components; bundles
sell as composed SKUs. Optimistic concurrency rides on the **bundle
variant's `version`** (checked + bumped atomically with the line writes in
both stores) — the lines table carries no version of its own.

## Rules (server-side, both stores)

- Create needs an **active, BOM-less** shell + **≥1 active** components;
  update replaces the whole BOM and needs an existing BOM.
- `qty` must be a positive integer; one component appears at most once
  per bundle (`409 BUNDLE_CONFLICT`).
- Self-reference and transitive cycles reject with `422 BUNDLE_CYCLE`
  (DFS over the workspace BOM graph with the write applied as-if
  committed).
- Missing rows (or cross-workspace misses) are `404`; stale
  `expectedVersion` is `409 BUNDLE_VERSION_CONFLICT` (+ `currentVersion`).
- RBAC: reads any active member; create/update/archive Manager/Admin.
- Removal is archive-only (`POST …/archive` clears lines, idempotent);
  `DELETE` answers `405 CATALOG_NO_HARD_DELETE` like the rest of catalog.

## Stock implications (MVP)

- **Bundle variants hold no direct stock.** `POST …/variants/:id/adjustments`
  on a bundle rejects with `422 BUNDLE_NO_DIRECT_STOCK` — adjust the
  component variants instead (ledger + levels stay component-level).
- **Availability derives, never stored:** detail responses carry
  per-warehouse `available = min(floor(componentOnHand / requiredQty))`
  across components (missing level rows count as zero).
- **Archive guards:** archiving a variant (or its product) that an
  _active_ bundle consumes rejects with `409 CATALOG_CONFLICT` — remove
  the variant from the BOM first. Archiving the bundle shell keeps its
  lines as history (like ledger/mappings); the archived shell rejects
  further BOM writes.

## Deferred (ambiguous in the PRD — not implemented)

- **Sell-time deduct/reserve:** no order/sell path exists yet, so no
  automatic component deduction or reservation is wired. When Story 13's
  sell flow lands, the intended rule is: selling N bundles appends
  `−N×qty` ledger entries per component (one warehouse, atomic with the
  sale; insufficient component stock rejects the sale). Availability math
  above is the read side of that rule.
- **HPP rollup:** bundle HPP stays manual (`hppCents` on the variant);
  deep cost rollup from components is Story 15.
- **Marketplace listing create from a bundle:** out of scope (uses the
  existing channel-mapping stub per variant when it lands).

## Endpoints (all under `/api/workspaces/:workspaceId/catalog`)

`GET|POST /bundles` (list supports `?limit=`) ·
`GET|PATCH|DELETE(405) /bundles/:bundleVariantId` ·
`POST /bundles/:bundleVariantId/archive`.

## Runbook — memory vs `DATABASE_URL`

- **Memory mode** (no `DATABASE_URL`): route handlers use the
  process-local `InMemoryCatalogStore` (BOM lines live in the same
  object; reset via `__resetCatalogForTests` alongside
  `__resetAuthForTests`). Used by `web/src/__tests__/bundles.test.ts`
  and local dev. Responses include `"storage": "memory"` so fixture
  evidence is never mistaken for Postgres rows.
- **Postgres mode** (`DATABASE_URL` set, e.g. a Neon branch — never
  production credentials in tests): handlers use `DrizzleCatalogStore`.
  Apply migrations first (`pnpm --filter @tokoboss/database db:migrate`
  against the branch), then run the app. PGlite integration coverage lives
  in `packages/database/src/__tests__/bundles.test.ts` (applies
  `0001 → 0011` with zero Neon credentials).
- Verify: `pnpm --filter @tokoboss/application test`,
  `pnpm --filter @tokoboss/database test`, `pnpm --filter web test`,
  `pnpm typecheck`.

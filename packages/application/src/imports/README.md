# Unstructured product import — API + review/confirm pipeline (UTA-77, Story 02)

Workspace-scoped import pipeline. API + job pipeline only — no web review UI
(separate Task if the mockup expands). No live marketplace calls.

## Pipeline

```
upload (CSV text | pre-parsed rows) → parse → review → confirm → catalog
```

1. **Upload + parse** — `POST /api/workspaces/:ws/imports` (Manager/Admin).
   CSV text goes in `content`; xlsx/photo/PDF converters submit `rows`
   (the server never parses binary formats — see below). The batch links a
   `product-import` job (`jobs`/`job_events`: queued → running → completed)
   with the batch as its output ref. Idempotent on
   `(workspace, idempotencyKey)`: retries resolve to the existing batch
   (`duplicate: true`).
2. **Review** — `GET …/imports` (list), `GET …/imports/:batchId` (batch +
   rows). `PATCH …/rows/:rowId` edits a candidate (re-validated) or rejects
   it; `PATCH …/imports/:batchId` with `{action:"reject"|"reopen"}` manages
   the batch. Reads: any active member.
3. **Confirm** — `POST …/imports/:batchId/confirm` (Manager/Admin, optional
   `{rowIds}` subset). Creates Product/SKU TokoBoss rows **via the UTA-75
   catalog use-cases** (every Story 01 rule still applies). Duplicate SKU
   codes surface `duplicates[]` with `existingPath` and mark those rows
   rejected — the existing row is never overwritten. Re-confirming is safe.

## Freeze rules (server-side, both stores)

- Marketplace Store SKU text (`store_sku`/`seller_sku`/`platform_sku_id`
  columns) is a **candidate mapping only**: on confirm it is written to
  `catalog_channel_mappings` (`channel` defaults to `import`, `shop` to
  `import`). It NEVER becomes `skuCode`.
- `skuCode` comes only from `sku_tokoboss`, or a server-generated
  `IMP-<row>-<slug>` when blank. Within-batch SKU collisions: first row
  keeps the code, later rows are rejected as batch-duplicates.
- Rows sharing a product name confirm into **one product with N variants**.
- RBAC: reads any active member; upload/review/confirm Manager/Admin.
  Cross-workspace access is denied indistinguishably (403
  `TENANCY_FORBIDDEN`).

## Column vocabulary (case-insensitive, ID/EN aliases)

`product_name` (required), `sku_tokoboss` (optional), `variant_name`,
`barcode`, `price`/`harga` (required, integer cents — `99.000`/`99,000`
thousand separators tolerated), `currency` (default `IDR`), `hpp`,
`cost_source`, `listing_name`, `unit` (default `pcs`), `channel`,
`shop_id`, `platform_sku_id`, `store_sku`/`seller_sku` (mapping hint).

Limits: 500 rows / 1,000,000 chars per batch. Rows failing validation stay
`draft` with `errors[]`; only `review` rows confirm. A UTF-8 BOM is stripped;
two rows claiming the same SKU TokoBoss confirm once — the later row is
rejected as a batch-duplicate (no near-duplicate identities are minted).

## xlsx / photo / PDF

Accepted **as pre-parsed `rows`** (same review pipeline, same freeze).
Convert client-side (sheet → objects with the vocabulary above, OCR for
photo/PDF) and POST with `contentType` of the original file. The server
rejects binary `content` with `IMPORT_VALIDATION` so converters can never
be mistaken for parsed data.

## Runbook — memory vs `DATABASE_URL`

- **Memory mode** (no `DATABASE_URL`): `InMemoryImportStore` (+ in-memory
  auth/tenancy/catalog/jobs). Used by `web/src/__tests__/imports.test.ts`
  (reset via `__resetImportsForTests` alongside `__resetAuthForTests` and
  `__resetCatalogForTests`). Responses include `"storage": "memory"`.
- **Postgres mode** (`DATABASE_URL` set, e.g. a Neon branch — never
  production credentials in tests): `DrizzleProductImportStore` +
  `DrizzleCatalogStore` for confirm. Apply migrations first
  (`pnpm --filter @tokoboss/database db:migrate` against the branch).
  PGlite integration coverage lives in
  `packages/database/src/__tests__/product-imports.test.ts` (applies
  `0001 → 0010` with zero Neon credentials).
- Verify: `pnpm --filter @tokoboss/application test`,
  `pnpm --filter @tokoboss/database test`, `pnpm --filter web test`,
  `pnpm typecheck`.

## Data model (`0010_product_imports.sql`)

| Table                    | Key / constraint                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product_import_batches` | `UNIQUE (workspace_id, idempotency_key)`; `job_id → jobs.id` (SET NULL); status `draft`/`review`/`applied`/`rejected` + row counters                                                |
| `product_import_rows`    | `batch_id → batches.id` (CASCADE); `(batch_id, row_number)` index; status `draft`/`review`/`applied`/`rejected`; `errors[]`, `duplicate_of`, `applied` (product/variant ids), `raw` |

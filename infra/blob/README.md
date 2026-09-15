# Private Blob Storage — Vercel Blob adapter stub + fixtures (UTA-15)

All operational files default to the **private** store. There is no public
path: reads are authorized through the application (`authorizeDownload`),
which mints short-lived download grants. Postgres holds `file_uploads`
**metadata only** (pathname/URL reference, MIME, size, checksum, creator,
retention, status) — never Blob contents, never secrets.

## Pieces

| Piece | Path |
| --- | --- |
| Storage port (`ObjectStoragePort`, purposes, `DEFAULT_BLOB_ACCESS = 'private'`) | `packages/domain/src/ports/storage.ts` |
| Vercel Blob private adapter stub + memory fixture adapter | `packages/integrations/src/blob/vercel-blob-adapter.ts` |
| Upload use cases (token / complete / download / delete + audit) | `packages/application/src/uploads/` |
| `file_uploads` schema | `packages/database/src/schema/file-uploads.ts` |
| Migration | `infra/drizzle/0004_file_uploads.sql` |
| Route Handlers | `web/src/app/api/uploads/token/route.ts`, `complete/route.ts`, `[id]/route.ts` (GET + DELETE) |
| Wiring (postgres ↔ memory, vercel-blob ↔ memory-blob) | `web/src/lib/uploads.ts` |

## Auth stub (Workstream 0)

Tenancy comes from the required `x-workspace-id` header; token issuance
additionally requires `x-role: owner | admin | staff`. An optional
`Authorization: Bearer …` value is recorded only as an opaque actor
reference (presence is logged, the value never is). Real session auth is
out of scope.

## Fixture upload/read locally (no credentials)

With neither `DATABASE_URL` nor `BLOB_READ_WRITE_TOKEN` set, the web app
uses the in-memory store + memory blob — responses include
`"storage": "memory", "blob": "memory-blob"` so fixture evidence can never
be mistaken for Postgres timelines.

```bash
# 1. Start web (local stub mode)
pnpm --filter @tokoboss/web dev

# 2. Issue a short-lived upload token (validated BEFORE issuance:
#    role, workspace, purpose, filename/type, size)
curl -s -X POST http://localhost:3000/api/uploads/token \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: <workspace-uuid>' \
  -H 'x-role: staff' \
  -d '{"purpose":"fixture","filename":"hello.txt","contentType":"text/plain","byteSize":13,"idempotencyKey":"fix-local-1"}'

# 3. PUT the bytes to the returned uploadUrl (fixture adapter keeps them
#    in process memory; the Vercel adapter would PUT to Blob)

# 4. Complete (idempotent — repeats return { duplicate: true })
curl -s -X POST http://localhost:3000/api/uploads/complete \
  -H 'content-type: application/json' \
  -H 'x-workspace-id: <workspace-uuid>' \
  -d '{"uploadId":"<id>","pathname":"<pathname>","byteSize":13}'

# 5. Private read (workspace-scoped; foreign workspace → 404)
curl -s http://localhost:3000/api/uploads/<id> \
  -H 'x-workspace-id: <workspace-uuid>'

# 6. Delete (tombstone + object removal + audit event)
curl -s -X DELETE http://localhost:3000/api/uploads/<id> \
  -H 'x-workspace-id: <workspace-uuid>'
```

Allowed purposes: `import | manual-order | sku-picture | label | evidence |
return | export | fixture` (see `PURPOSE_MIME_ALLOWLIST` /
`PURPOSE_MAX_BYTES` in `packages/application/src/uploads/upload-types.ts`).
Invalid size/type/purpose is rejected with `UPLOAD_VALIDATION` (400) before
any token is issued; cross-workspace reads return 404
(`UploadForbiddenError` is indistinguishable from not-found).

## Preview (Neon branch + preview Blob store)

```bash
DATABASE_URL=<preview-branch-url> \
BLOB_READ_WRITE_TOKEN=<preview-blob-rw-token> \
pnpm --filter @tokoboss/web dev
```

Responses then report `"storage": "postgres", "blob": "vercel-blob"`.
Preview must NEVER use production credentials (see `infra/neon/README.md`,
`infra/vercel/README.md`). Production swap-in for the adapter is
`generateClientToken()` from `@vercel/blob/client` (still
`access: 'private'`); the port shape and
`workspaces/{workspaceId}/{purpose}/{key}/{file}` pathname convention do
not change.

## Tests

```bash
pnpm --filter @tokoboss/application test   # validation, idempotent completion, cross-workspace deny, metadata-only
pnpm --filter @tokoboss/database test      # 0001→0004 chain, uniques, info-schema metadata-only proof
pnpm --filter @tokoboss/integrations test  # private default, short-lived tokens, RW secret never exposed
pnpm --filter @tokoboss/web test           # fixture upload/read through the route wiring
```

Product-specific retention policies, marketplace import/label pipelines,
and Jobs/Workflow changes beyond the existing audit pattern are out of
scope (UTA-15).

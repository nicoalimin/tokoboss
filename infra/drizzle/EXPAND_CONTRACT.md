# Expand/Contract Migrations (UTA-10)

Destructive or locking changes (drop column/table, rename, change type,
add `NOT NULL` without default, add FK without `NOT VALID`) must ship as
**two or more** small, backwards-compatible migrations so old and new code
can run against either schema version during rollout.

## The pattern

### Expand — additive, safe, zero-downtime

Ship new structures alongside old ones. Only additive operations:

- `ADD COLUMN ... NULL` (or with a `DEFAULT`)
- `CREATE TABLE ...`
- `CREATE INDEX CONCURRENTLY ...` (never bare `CREATE INDEX` on a hot table —
  it takes an `ACCESS EXCLUSIVE` lock; use `CONCURRENTLY` via a separate
  migration step)
- Add a new FK as `NOT VALID`, then `VALIDATE CONSTRAINT` in a follow-up step

Example:

```sql
ALTER TABLE "products" ADD COLUMN "slug" text;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY "products_slug_unique" ON "products" ("slug");
```

Deploy the code that **writes both** old and new shapes (dual-write) and
backfill existing rows in batches.

### Contract — remove the old shape

Only after every running instance reads/writes the new shape:

- `DROP COLUMN`, `DROP TABLE`
- `ALTER COLUMN ... SET NOT NULL` (after backfill + validation)
- Rename via add → copy → drop (never bare `RENAME` while old code is live)

## Checklist for the migration author

1. [ ] Can this migration run while the previous release is still serving?
2. [ ] Does it avoid `ACCESS EXCLUSIVE` locks on large tables
       (prefer `CONCURRENTLY`, batched backfills, `NOT VALID` + `VALIDATE`)?
3. [ ] Is rollback safe — i.e. does the _previous_ release still work if we
       stop after the expand step?
4. [ ] Is the contract step a separate PR/migration, deployed after the
       expand step has fully rolled out?
5. [ ] Is the migration marked in the PR description as `expand` or `contract`?

## What needs expand/contract vs. what is safe directly

| Change                                                   | Handling                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| New nullable column / new table / new index concurrently | Single migration, safe                                             |
| New `NOT NULL` column without default                    | Expand: add nullable → backfill → `SET NOT NULL` (contract)        |
| Rename column/table                                      | Expand: add new → dual-write/copy → Contract: drop old             |
| Change column type                                       | Expand: add new column → migrate reads/writes → Contract: drop old |
| Drop column/table                                        | Contract only, after code stops referencing it                     |
| Add FK constraint                                        | Expand with `NOT VALID` → `VALIDATE CONSTRAINT` separately         |
| `CREATE INDEX` (non-concurrent) on a large table         | Forbidden — use `CONCURRENTLY`                                     |

## Review gate

Any migration containing `DROP`, `RENAME`, `ALTER COLUMN`, or a non-concurrent
`CREATE INDEX` must call out the expand/contract plan in the PR description,
or CI review should block it.

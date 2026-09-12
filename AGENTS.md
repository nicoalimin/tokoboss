# AGENTS.md — TokoBoss

Repo: TypeScript pnpm monorepo (`web/`, `mobile/`, `infra/`, `packages/`).
Stack: Next.js 15, Expo, Drizzle ORM + Neon Postgres (planned).

## Commands

- `pnpm install` — install all workspaces
- `pnpm typecheck` / `pnpm lint` — must pass before push
- `pnpm --filter <pkg> typecheck` — scoped check (e.g. `@tokoboss/config`)

## Rebase policy

- Feature branches rebase onto `origin/main`, never merge `main` into the branch.
- Flow: `git fetch origin main` → `git rebase origin/main` → resolve → `pnpm install` (fix lockfile) → `pnpm typecheck` → `git push --force-with-lease`.
- For `web/package.json` + `pnpm-lock.yaml` conflicts: keep the union of deps from both sides, then re-run `pnpm install` to regenerate the lockfile.

## Migration rebase rule (Drizzle / Neon)

Migrations live in `infra/drizzle/` (`NNNN_name.sql` + `meta/_journal.json`) with DB setup notes in `infra/neon/`. They are strictly ordered — duplicate sequence numbers break deploys.

When a rebase onto `main` produces migration conflicts:

1. **Never renumber `main`.** Already-merged migrations on `main` are immutable.
2. **Branch migrations always move after `main`.** Find max sequence on `main` (`ls infra/drizzle/*.sql` on `origin/main`), then renumber every branch-only migration to `max+1, max+2, ...` in original creation order.
3. **Rename files + fix metadata:** rename the `NNNN_*.sql` files, update `meta/_journal.json` entries (filename + idx), and fix any references in code/docs/down-migrations.
4. **Resolve the rebase:** `git add` the renamed files, `git rm` the old conflicting paths if still staged, then `git rebase --continue`.
5. **Verify:** `pnpm --filter @tokoboss/database typecheck` and confirm `ls infra/drizzle/*.sql` is gap-free with no duplicates vs `origin/main`.

Example: `main` ends at `0003_...`, branch adds `0003_...` + `0004_...` → renumber branch files to `0004_...` + `0005_...`.

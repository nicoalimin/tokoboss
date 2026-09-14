# Neon Postgres (UTA-10)

Neon is the system of record. Drizzle (see `infra/drizzle/README.md`) is the
only schema migration mechanism.

## Branch layout

| Branch      | Used by                    | Source                        |
| ----------- | -------------------------- | ----------------------------- |
| production  | `main` deploys             | —                             |
| staging     | staging deploys            | branch of production          |
| dev/preview | local dev, PR previews, CI | throwaway branches of staging |

Automated preview-branch wiring lands in UTA-11; until then create branches
in the Neon console and wire URLs manually per `infra/vercel/PROJECT_SETTINGS.md`
(preview envs must never receive production credentials).

## Trying the initial migration (empty non-production branch)

```bash
# From the repo root, with DATABASE_URL pointing at an empty branch:
DATABASE_URL='postgresql://<user>:<password>@<branch-host>/<db>?sslmode=require' \
  pnpm --filter @tokoboss/database db:migrate
# Re-run to prove idempotence — expect "no pending work":
DATABASE_URL='...' pnpm --filter @tokoboss/database db:migrate
```

Acceptance checklist for UTA-10:

- [ ] reviewed `0000_*.sql` applies cleanly to the empty branch;
- [ ] second run records no new work;
- [ ] `pnpm --filter @tokoboss/database test` passes (transaction integration test);
- [ ] `pnpm --filter @tokoboss/database db:check` passes;
- [ ] no production URL, password, or dump appears in tests, seeds, or logs
      (seeds are synthetic `SEED_*` rows; `db:seed` refuses production).

## Connection strings

- Runtime and migrations read `DATABASE_URL`; serverless runtime prefers the
  pooled URL via `DATABASE_POOL_URL` when set (see `packages/config/env.ts`).
- Keep `?sslmode=require` on every Neon URL.
- The adapter (`DrizzleDatabase`) uses a small `pg` pool with interactive
  transactions; `executor()` joins the ambient transaction inside
  `db.transaction()`.

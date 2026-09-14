# Runbook: CI failures

CI workflow: `.github/workflows/ci.yml` (jobs below). Reproduce any job
locally with the commands from [`../README.md`](../README.md#how-to-run-ci-locally).

| Job             | What it runs                            | First check                                                                                                                                                                                                                |
| --------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`          | `pnpm lint`                             | which workspace failed; run its `lint` script locally                                                                                                                                                                      |
| `typecheck`     | `pnpm typecheck`                        | known trap: workspace missing a dep (UTA-12 fixed `@tokoboss/application` → `@tokoboss/domain`, `@tokoboss/contracts` → `zod`)                                                                                             |
| `boundaries`    | `pnpm test:boundaries` + `test:example` | forbidden import in `packages/domain/src` (see `tests/boundary/check-boundaries.js`)                                                                                                                                       |
| `unit`          | `pnpm test`                             | failing workspace test; rerun that package with `--filter`                                                                                                                                                                 |
| `migrations`    | `db:check:kit` + `db:check`             | journal/SQL mismatch or uncommitted `infra/drizzle` files; see AGENTS.md migration rebase rule — never renumber `main`. UTA-12 fixed a snapshot-chain fork (`0002` genesis `prevId` → chained to `0001` id, metadata-only) |
| `web-build`     | `pnpm --filter @tokoboss/web build`     | new API route importing a non-resolvable specifier (workspace imports must be extensionless in `src/`, e.g. `./logger` not `./logger.js`)                                                                                  |
| `mobile-checks` | mobile `lint` + `typecheck`             | scaffold owned by UTA-13; do not add product code here                                                                                                                                                                     |
| `failure-proof` | `ci-failure-proof.mjs`                  | a gate passed broken input — treat as P1, gates are blind                                                                                                                                                                  |
| `health`        | boot + curl + secret scan               | see [`health-readiness.md`](./health-readiness.md)                                                                                                                                                                         |

After fixing: `pnpm install` (lockfile), `pnpm typecheck`, push.

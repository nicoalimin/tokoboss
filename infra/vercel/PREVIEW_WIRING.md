# Preview `DATABASE_URL` wiring (UTA-11)

How each Vercel preview deployment receives **only** its own PR's Neon branch
URL — and why Production/Staging credentials are unreachable from Preview.

## Deploy wiring inventory

`web/` is linked to Vercel as a monorepo project with **Root Directory `web`**
(see `infra/vercel/PROJECT_SETTINGS.md` → General Settings). Vercel
auto-creates a Preview deployment for every PR; pushes to `main` deploy to
Production.

### Environment ownership matrix

| Vercel target              | Git ref        | `APP_ENV`    | `DATABASE_URL` value                           | Owned / written by                                                  |
| -------------------------- | -------------- | ------------ | ---------------------------------------------- | ------------------------------------------------------------------- |
| Production                 | `main`         | `production` | Neon `main`/`prod` pooled URL                  | Operator, Production scope only                                     |
| Preview (staging)          | `develop`      | `staging`    | Neon `staging` branch URL                      | Operator, branch-scoped to `develop`                                |
| Preview (PR `#n`)          | PR head branch | `preview`    | `preview/pr-<n>` branch URL (child of staging) | `preview-setup.mjs` automation, branch-scoped to the PR head branch |
| Development (`vercel dev`) | local          | `local`      | `.env.local`                                   | Developer machine                                                   |

Rules (enforced by `packages/config` validation + the scripts):

- Production credentials exist **only** in Production scope. They are never
  copied to Preview scope, never passed to preview scripts, and never logged.
- A single shared Preview `DATABASE_URL` is **forbidden**: Vercel Preview
  target vars are visible to every preview deployment, so one shared value
  would leak PR A's database to PR B. Each PR gets a branch-scoped var
  (`target: ["preview"]`, `gitBranch: <head branch>`), created and deleted by
  the automation.
- Preview branches are children of **Staging**, never Production
  (`assertStagingParent` in `infra/neon/preview-lib.mjs` refuses
  parent == `NEON_PRODUCTION_BRANCH_ID` and production-looking parent names).
- Preview data is synthetic only: the setup runs `db:migrate` + `db:seed` with
  `APP_ENV=preview`; `assertSafeToSeed` refuses production unconditionally and
  `assertNoProductionUrl` refuses production-looking URLs.

## Wiring flow (per PR)

```
PR opened/sync
  → preview-setup.mjs
    → Neon: ensure preview/pr-<n> (child of staging) → wait ready
    → Drizzle migrate (reviewed SQL from infra/drizzle) + synthetic seed
    → Vercel API: delete stale DATABASE_URL for gitBranch, create new
       { key: DATABASE_URL, target: [preview], gitBranch: <head> }
    → log redacted correlation { pr, gitBranch, neonBranchId, databaseHost }
  → Vercel builds the preview → runtime reads only its branch URL

PR closed
  → preview-cleanup.mjs
    → Neon: delete preview/pr-<n> (protected names refused)
    → Vercel API: delete DATABASE_URL scoped to the head branch
    → Blob: no-op hook (private store lands in UTA-15)
```

Vercel redeploys the preview after env changes; deployments on other branches
keep their own values because scoping is per `gitBranch`.

## Verification checklist

- [ ] PR setup log shows `"action":"ready"` with the PR's branch name and a
      distinct `databaseHost` per PR (hostnames only, never secrets).
- [ ] Two concurrent previews have different branch names/hosts and cannot
      observe each other's writes (procedure in `infra/neon/README.md`).
- [ ] PR close log shows `"action":"branch-deleted"` (or `branch-already-gone`
      on retry); reconciler dry-run lists zero stranded branches.
- [ ] Vercel Dashboard → Preview env shows no shared `DATABASE_URL`; each PR
      head branch carries its own branch-scoped value; Production scope is
      untouched.
- [ ] A failed setup (bad branch create / migrate) fails the workflow run
      visibly; re-running succeeds without manual cleanup.

## Secrets ownership

Automation secrets live in GitHub Actions secrets (never in the repo):
`NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_STAGING_BRANCH_ID`,
`NEON_PRODUCTION_BRANCH_ID` (guard), `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`,
`VERCEL_TEAM_ID`. Operators running scripts manually export the same names.

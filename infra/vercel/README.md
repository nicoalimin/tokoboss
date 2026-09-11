# Vercel Deployment Configuration

This directory contains configuration and documentation for deploying TokoBoss to Vercel with proper environment isolation according to RFC 01.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Strategy](#environment-strategy)
- [Linking the Vercel Project](#linking-the-vercel-project)
- [Environment Variables](#environment-variables)
- [Preview Isolation](#preview-isolation)
- [Deployment Workflow](#deployment-workflow)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Vercel CLI installed: `npm i -g vercel`
- Access to TokoBoss Vercel team
- GitHub repository access to `nicoalimin/tokoboss`

### Initial Setup

1. **Link the Vercel project** (run from repository root):
   ```bash
   vercel link
   ```
   
   Select:
   - Scope: Your Vercel team
   - Link to existing project: Yes (if project exists) or No (to create new)
   - Name: `tokoboss`
   - Root directory: Keep as `.` (monorepo root)

2. **Configure project settings** in Vercel Dashboard:
   - Go to Project Settings → General
   - Set **Root Directory**: `web` (important for monorepo)
   - Set **Framework Preset**: Next.js
   - Set **Build Command**: `pnpm build`
   - Set **Install Command**: `pnpm install --frozen-lockfile`

3. **Set up environment variables** (see [Environment Variables](#environment-variables))

4. **Deploy**:
   ```bash
   # Deploy to preview
   vercel
   
   # Deploy to production
   vercel --prod
   ```

## Environment Strategy

According to RFC 01, TokoBoss uses four distinct environments:

| Environment | Vercel Environment | Git Branch | Purpose |
|-------------|-------------------|------------|---------|
| **Production** | `production` | `main` | Live production serving real users |
| **Staging** | `preview` (custom) | `develop` or release branches | Pre-production testing with production-like data |
| **Preview** | `preview` | Feature branches (PRs) | Isolated PR preview deployments |
| **Local** | N/A | Any branch | Developer machines |

### Key Principles

1. **Isolation**: Each environment has completely separate credentials
2. **Preview Safety**: PR previews NEVER access production databases, storage, or APIs
3. **Fail Fast**: Invalid configuration prevents deployment
4. **Observability**: All deployments include metadata for tracing

## Linking the Vercel Project

### For Monorepo with Multiple Apps

This repository contains:
- `/web` - Next.js web application (deployed to Vercel)
- `/mobile` - React Native mobile app (not deployed to Vercel)
- `/packages/*` - Shared packages

**Important**: The Vercel project must be configured with `rootDirectory: web` to deploy only the web application while keeping the entire monorepo in one repository.

### Initial Link

```bash
# From repository root
vercel link
```

This creates `.vercel/project.json` which should be gitignored (already in `.gitignore`).

### Project Settings

In Vercel Dashboard → Project Settings:

**General**:
- Root Directory: `web`
- Framework Preset: Next.js
- Build Command: `pnpm build`
- Install Command: `pnpm install --frozen-lockfile`
- Output Directory: Leave empty (uses `.next` default)

**Git**:
- Production Branch: `main`
- Preview Branches: All branches (Vercel auto-creates preview for each PR)

**Build & Development Settings**:
- Node.js Version: 22.x (see `engines` in root `package.json`)

## Environment Variables

### Variable Ownership Matrix

| Variable | Production | Staging | Preview | Local | Notes |
|----------|-----------|---------|---------|-------|-------|
| `NODE_ENV` | `production` | `production` | `production` | `development` | Set by Vercel |
| `VERCEL_ENV` | `production` | `preview` | `preview` | undefined | Set by Vercel |
| `APP_ENV` | `production` | `staging` | `preview` | `local` | Manual override |
| `NEXT_PUBLIC_APP_URL` | `https://tokoboss.com` | `https://staging.tokoboss.com` | `https://<unique>.vercel.app` | `http://localhost:3000` | Public URL |
| `NEXT_PUBLIC_APP_ENV` | `production` | `staging` | `preview` | `local` | Displayed to users |
| Database credentials | Production DB | Staging DB | ⚠️ Mock/dev DB | Local dev DB | **Preview must NOT use production** |
| Blob storage tokens | Production | Staging | ⚠️ Separate preview | Local dev | **Preview must NOT use production** |
| API keys (marketplace) | Production | Staging | ⚠️ Sandbox/test | Development | **Preview must NOT use production** |
| Payment/billing secrets | Production | Staging | ❌ Not set | Not set | **Preview must NOT have these** |
| Signing keys | Production | Staging | ❌ Not set | Development | **Preview must NOT have production keys** |

⚠️ = Must be isolated from production
❌ = Should not be set at all

### Setting Environment Variables

#### Via Vercel CLI

```bash
# Production only
vercel env add NEXT_PUBLIC_APP_URL production
# Enter: https://tokoboss.com

# Preview only (all preview deployments)
vercel env add DATABASE_URL preview
# Enter: <staging-or-preview-database-url>

# All environments
vercel env add SOME_SHARED_CONFIG production preview development
```

#### Via Vercel Dashboard

1. Go to Project Settings → Environment Variables
2. Click "Add New"
3. Enter key and value
4. Select environments: Production, Preview, and/or Development
5. Click "Save"

**Important**: Always set environment-specific values for Production, Staging (via Preview), and Preview deployments separately.

### Public vs Server-Only Variables

**Public (Client-Side) Variables**:
- Must be prefixed with `NEXT_PUBLIC_`
- Embedded in client bundle
- Never contain secrets
- Examples: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV`

**Server-Only Variables**:
- No prefix
- Only available in server code
- Can contain secrets
- Examples: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, API keys

**Security Rule**: Server-only variables must NEVER be accessed in client components or exposed via API responses to clients.

### Phase 0 Variables (Current)

For initial deployment (before UTA-10), only these variables are needed:

**Production**:
```bash
NEXT_PUBLIC_APP_URL=https://tokoboss.com
NEXT_PUBLIC_APP_ENV=production
APP_ENV=production
```

**Staging**:
```bash
NEXT_PUBLIC_APP_URL=https://staging.tokoboss.com
NEXT_PUBLIC_APP_ENV=staging
APP_ENV=staging
```

**Preview**:
```bash
NEXT_PUBLIC_APP_ENV=preview
APP_ENV=preview
```

**Local** (`.env.local`):
```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_ENV=local
APP_ENV=local
```

### Future Variables (UTA-10+)

When database and storage are added, these will be required:

**Production**:
- `DATABASE_URL` - Neon production database
- `DATABASE_POOL_URL` - Neon production connection pool
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob production

**Staging**:
- `DATABASE_URL` - Neon staging database
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob staging

**Preview**:
- `DATABASE_URL` - Neon preview/dev database (separate from production!)
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob preview (separate from production!)

## Preview Isolation

### Critical Security Requirements

According to RFC 01, **PR preview deployments must NEVER have access to**:

1. ❌ Production database credentials
2. ❌ Production blob storage tokens
3. ❌ Production marketplace/SaaS API keys
4. ❌ Production billing/payment secrets
5. ❌ Production signing/encryption keys

### Why Preview Isolation Matters

- PR branches may contain untested or malicious code
- External contributors may open PRs
- Preview deployments should be safe to test destructive operations
- Production data must remain secure

### How We Enforce Isolation

1. **Environment Validation**: The `@tokoboss/config` package validates environment variables at server startup
2. **Discriminated Schemas**: Different environments require different variables
3. **Fail Fast**: Invalid configuration prevents the server from starting
4. **Documentation**: This document and code comments enforce the rule

### Setting Up Preview Environment

In Vercel Dashboard → Environment Variables:

1. Create separate credentials for preview:
   - Preview database (e.g., Neon branch or separate dev database)
   - Preview blob storage (separate Vercel Blob project or development)
   - Test/sandbox API keys (not production)

2. Set these ONLY for the "Preview" environment in Vercel

3. Never copy production credentials to preview

### Staging Environment Setup

Staging uses the Vercel "Preview" environment but with different credentials:

**Option A: Branch-based (Recommended)**:
- Create a `staging` or `develop` branch
- Deploy: `vercel --branch=staging`
- Set environment variables specifically for staging deployments

**Option B: Custom Vercel Environment** (Enterprise):
- Create custom "Staging" environment in Vercel
- Set separate credentials for staging
- Configure deployment rules

For Phase 0, we use Option A with the `develop` branch representing staging.

## Deployment Workflow

### Automatic Deployments (Recommended)

Vercel automatically deploys:

1. **Production**: Every push to `main` branch
2. **Preview**: Every push to any branch with an open PR

### Manual Deployments

```bash
# Preview deployment
vercel

# Production deployment (use with caution)
vercel --prod

# Deploy specific branch
vercel --branch=feature-xyz
```

### Deployment Checklist

Before deploying to production:

- [ ] All tests pass locally: `pnpm test`
- [ ] Linting passes: `pnpm lint`
- [ ] Type checking passes: `pnpm typecheck`
- [ ] Build succeeds: `pnpm build`
- [ ] Environment variables are set correctly in Vercel
- [ ] Preview deployment tested successfully
- [ ] Staging deployment tested (if applicable)
- [ ] Database migrations applied (when UTA-10 lands)
- [ ] No secrets in source code or logs

### Rollback Procedure

If a production deployment has issues:

1. **Via Vercel Dashboard**:
   - Go to Deployments tab
   - Find the last known good deployment
   - Click "..." → "Promote to Production"

2. **Via Git**:
   ```bash
   # Revert the problematic commit
   git revert <commit-sha>
   git push origin main
   # Vercel auto-deploys the revert
   ```

3. **Emergency Hotfix**:
   ```bash
   # Create hotfix branch from last good commit
   git checkout <last-good-commit>
   git checkout -b hotfix/emergency-fix
   # Make minimal fix
   git commit -m "hotfix: emergency fix"
   git push origin hotfix/emergency-fix
   # Manually deploy to production
   vercel --prod
   ```

## Troubleshooting

### Build Failures

**Error: "Environment validation failed"**

- Check that all required environment variables are set in Vercel
- Verify variable names match exactly (case-sensitive)
- Check the build logs for specific missing variables

**Error: "pnpm install failed"**

- Verify `package.json` and `pnpm-lock.yaml` are committed
- Check that Node.js version in Vercel matches `engines` in `package.json`
- Clear Vercel build cache: Project Settings → General → Clear Build Cache

**Error: "Module not found: @tokoboss/config"**

- Ensure `pnpm install --frozen-lockfile` runs from repo root
- Check that `packages/config` is properly configured in `pnpm-workspace.yaml`
- Verify workspace dependencies are declared correctly

### Runtime Issues

**Preview deployment accessing production data**

- **Immediately revoke** the preview deployment
- Check environment variables in Vercel Dashboard
- Ensure production credentials are ONLY set for "Production" environment
- Review audit logs to ensure no data was compromised

**Environment validation passes but app crashes**

- Check Vercel function logs: Project → Logs
- Look for unhandled promise rejections or runtime errors
- Verify all imported packages are in `dependencies` (not `devDependencies`)

**Instrumentation hook not running**

- Ensure `experimental.instrumentationHook: true` in `next.config.ts`
- Check that `instrumentation.ts` is at the root of `web/` directory
- Verify Next.js version is 13.2+ (supports instrumentation)

### Getting Help

1. Check Vercel build logs: Project → Deployments → (select deployment) → Build Logs
2. Check runtime logs: Project → Logs
3. Check this documentation: `/infra/vercel/README.md`
4. Review RFC 01 for environment strategy
5. Contact team lead or open an issue in Linear

## References

- [RFC 01](../../docs/rfcs/001-environment-strategy.md) - Environment strategy and isolation
- [Vercel Monorepo Guide](https://vercel.com/docs/monorepos)
- [Next.js Instrumentation](https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
- [Vercel CLI Reference](https://vercel.com/docs/cli)

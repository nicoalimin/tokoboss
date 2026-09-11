# Vercel Project Settings

This document contains the exact settings to configure in Vercel Dashboard for the TokoBoss project.

## General Settings

Navigate to: **Project Settings → General**

| Setting | Value | Notes |
|---------|-------|-------|
| Project Name | `tokoboss` | Must match GitHub repository |
| Framework Preset | Next.js | Auto-detected |
| Root Directory | `web` | **Critical for monorepo** |
| Build Command | `pnpm build` | Uses workspace from root |
| Install Command | `pnpm install --frozen-lockfile` | Uses pnpm workspace |
| Output Directory | (empty) | Uses Next.js default `.next` |
| Development Command | `pnpm dev` | For `vercel dev` |

## Build & Development Settings

Navigate to: **Project Settings → Build & Development Settings**

| Setting | Value | Notes |
|---------|-------|-------|
| Node.js Version | `22.x` | Match `engines` in package.json |
| Package Manager | `pnpm` | Auto-detected from `pnpm-lock.yaml` |

## Git Integration

Navigate to: **Project Settings → Git**

| Setting | Value | Notes |
|---------|-------|-------|
| Connected Git Repository | `nicoalimin/tokoboss` | GitHub integration |
| Production Branch | `main` | Auto-deploys to production |
| Preview Branches | All branches | Creates preview for all PRs |
| Ignored Build Step | (none) | Deploy every commit |
| Auto-expose System Environment Variables | Enabled | Provides `VERCEL_*` variables |

## Environment Variables

Navigate to: **Project Settings → Environment Variables**

See [README.md](./README.md#environment-variables) for complete list.

### Phase 0 (Minimal Bootstrap)

#### Production Environment

| Key | Value | Environments |
|-----|-------|--------------|
| `NEXT_PUBLIC_APP_URL` | `https://tokoboss.com` | Production |
| `NEXT_PUBLIC_APP_ENV` | `production` | Production |
| `APP_ENV` | `production` | Production |

#### Preview Environment (Staging)

For `develop` branch (representing staging):

| Key | Value | Environments |
|-----|-------|--------------|
| `NEXT_PUBLIC_APP_URL` | `https://staging.tokoboss.com` | Preview |
| `NEXT_PUBLIC_APP_ENV` | `staging` | Preview |
| `APP_ENV` | `staging` | Preview |

**Note**: Branch-specific environment variables can be set via Vercel CLI or Dashboard → Environment Variables → Add by branch.

#### Preview Environment (PR Previews)

| Key | Value | Environments |
|-----|-------|--------------|
| `NEXT_PUBLIC_APP_ENV` | `preview` | Preview |
| `APP_ENV` | `preview` | Preview |

**Note**: `NEXT_PUBLIC_APP_URL` is auto-set by Vercel as `VERCEL_URL` for PR previews.

#### Development Environment

| Key | Value | Environments |
|-----|-------|--------------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Development |
| `NEXT_PUBLIC_APP_ENV` | `local` | Development |
| `APP_ENV` | `local` | Development |

**Note**: Development environment is for `vercel dev` local development with Vercel CLI.

### Phase 1 (UTA-10+) - Database & Storage

When Neon and Vercel Blob are integrated:

#### Production

| Key | Value Example | Environments | Notes |
|-----|---------------|--------------|-------|
| `DATABASE_URL` | `postgresql://user:pass@prod.neon.tech/tokoboss` | Production | Neon production |
| `DATABASE_POOL_URL` | `postgresql://user:pass@prod-pooler.neon.tech/tokoboss` | Production | Connection pooler |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_...` | Production | Vercel Blob production |

#### Staging

| Key | Value Example | Environments | Notes |
|-----|---------------|--------------|-------|
| `DATABASE_URL` | `postgresql://user:pass@staging.neon.tech/tokoboss` | Preview (staging) | Neon staging branch |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_staging_...` | Preview (staging) | Separate Blob project |

#### Preview (PR Previews)

| Key | Value Example | Environments | Notes |
|-----|---------------|--------------|-------|
| `DATABASE_URL` | `postgresql://user:pass@preview.neon.tech/tokoboss` | Preview | Neon dev/preview branch |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_preview_...` | Preview | Separate from production |

**Critical**: Preview environment must NEVER use production credentials.

## Functions Settings

Navigate to: **Project Settings → Functions**

| Setting | Value | Notes |
|---------|-------|-------|
| Function Region | Auto (Closest to users) | Or specify: `sin1` (Singapore) |
| Max Duration | 10s (Hobby/Pro) | Upgrade if needed |

## Deployment Protection

Navigate to: **Project Settings → Deployment Protection**

| Setting | Value | Notes |
|---------|-------|-------|
| Vercel Authentication | Enabled (optional) | Password-protect preview deployments |
| Deployment Protection | Disabled (Phase 0) | Enable for production later |

## Ignored Build Step

Currently: **Not configured** (deploy every commit)

To skip builds based on conditions, add `.vercelignore` or use Vercel's ignored build step:

```bash
# .vercelignore example
mobile/**
packages/contracts/**
*.md
```

## Monitoring & Logs

Navigate to: **Project → Logs**

- Real-time function logs
- Build logs
- Deployment logs

Navigate to: **Project → Analytics** (if enabled)

- Web Vitals
- Visitor metrics

## Domains

Navigate to: **Project Settings → Domains**

### Production Domains

| Domain | Git Branch | Notes |
|--------|------------|-------|
| `tokoboss.com` | `main` | Primary production domain |
| `www.tokoboss.com` | `main` | Redirects to tokoboss.com |

### Staging Domain

| Domain | Git Branch | Notes |
|--------|------------|-------|
| `staging.tokoboss.com` | `develop` | Staging environment |

**Note**: Configure DNS records with your domain provider to point to Vercel:

```
A     @     76.76.21.21
CNAME www   cname.vercel-dns.com
```

## Security Settings

Navigate to: **Project Settings → Security**

| Setting | Value | Notes |
|---------|-------|-------|
| Automatically expose System Environment Variables | Enabled | Provides `VERCEL_*` |
| Secure Compute | Enabled (if available) | Enhanced security |

## Team Settings

Navigate to: **Project Settings → Team**

- Owner: TokoBoss team
- Members: Invite team members with appropriate roles

## Project Deletion Protection

Navigate to: **Project Settings → Advanced**

| Setting | Value | Notes |
|---------|-------|-------|
| Delete Project | Requires confirmation | Safeguard against accidental deletion |

---

## Applying These Settings

### Via Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select TokoBoss project
3. Go to Settings
4. Apply each setting as documented above

### Via Vercel CLI

Some settings can be configured via CLI:

```bash
# Link project
vercel link

# Add environment variable
vercel env add NEXT_PUBLIC_APP_URL production

# Set project settings (requires vercel.json in repo)
vercel --prod
```

### Via `vercel.json`

Project configuration is partially defined in `/vercel.json`:

```json
{
  "buildCommand": "cd web && pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "framework": "nextjs",
  "outputDirectory": "web/.next"
}
```

**Note**: Not all settings can be defined in `vercel.json`. Some require Dashboard configuration.

---

## Verification

After applying settings:

1. **Test Preview Deployment**:
   ```bash
   vercel
   ```
   Check that build succeeds and app runs correctly.

2. **Test Production Deployment** (from `main` branch):
   ```bash
   vercel --prod
   ```

3. **Check Environment Variables**:
   - Open preview deployment
   - Check console logs for "✓ Environment validation passed"
   - Verify deployment metadata appears correctly

4. **Verify Isolation**:
   - Ensure preview deployments do NOT have production credentials
   - Check environment variables in Vercel Dashboard
   - Test that preview safely operates with preview/staging resources

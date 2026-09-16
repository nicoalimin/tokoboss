# TokoBoss Web

Next.js 15 App Router application for TokoBoss with Tailwind CSS wired to design tokens.

## Development

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Tailwind CSS + Design Tokens

This web app uses Tailwind CSS v3 configured to use the shared design tokens from `@tokoboss/design-tokens`.

### Using Design Tokens

All design tokens from `packages/design-tokens` are automatically available as Tailwind utility classes:

#### Colors

The pastel color palette is available with the following prefixes:

```tsx
// Primary colors (soft blue)
<div className="bg-primary-500 text-primary-50">...</div>

// Secondary colors (soft mint)
<div className="bg-secondary-500 text-white">...</div>

// Accent colors (soft coral)
<div className="bg-accent-400 border-accent-600">...</div>

// Neutral colors (grayscale)
<div className="bg-neutral-100 text-neutral-900">...</div>

// Semantic colors
<div className="text-success-600">Success message</div>
<div className="text-error-500">Error message</div>
<div className="text-warning-500">Warning message</div>
<div className="text-info-500">Info message</div>
```

#### Typography

Font families, sizes, weights, and line heights:

```tsx
// Font families
<p className="font-sans">System font</p>
<code className="font-mono">Monospace</code>

// Font sizes (xs, sm, base, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl)
<h1 className="text-5xl">Large heading</h1>
<p className="text-base">Body text</p>

// Font weights (thin, extralight, light, normal, medium, semibold, bold, extrabold, black)
<p className="font-semibold">Semi-bold text</p>

// Line heights (none, tight, snug, normal, relaxed, loose)
<p className="leading-relaxed">Relaxed line height</p>
```

#### Spacing

Consistent spacing scale (0-64):

```tsx
// Padding, margin, gap
<div className="p-4 m-8 space-y-6">
  <div className="px-6 py-3">Button</div>
</div>
```

#### Border Radius

```tsx
// Border radius (none, sm, base, md, lg, xl, 2xl, 3xl, full)
<div className="rounded-lg">Rounded corners</div>
<button className="rounded-full">Pill button</button>
```

#### Shadows

```tsx
// Box shadows (sm, base, md, lg, xl, 2xl, none)
<div className="shadow-md">Card with shadow</div>
```

#### Z-Index

```tsx
// Z-index layers (base, dropdown, sticky, fixed, modalBackdrop, modal, popover, tooltip)
<div className="z-modal">Modal content</div>
```

### Touch Targets

The design tokens include minimum touch target sizes for mobile accessibility. Use these values when creating interactive elements:

- Minimum: 44px (iOS standard)
- Recommended: 48px (Android standard)

For buttons, use padding and min-height classes to ensure adequate touch targets:

```tsx
// Adequate touch target
<button className="px-6 py-3 min-h-[44px]">
  Button with proper touch target
</button>
```

### Mobile Compatibility

The design tokens are shared between web (Tailwind CSS) and mobile (React Native StyleSheet). This ensures consistent design across platforms while keeping the mobile app free of web-specific Tailwind coupling.

To use design tokens in mobile:

```ts
import { colors, typography, spacing } from '@tokoboss/design-tokens';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary[50],
    padding: spacing[4],
  },
});
```

### Configuration

The Tailwind configuration is in `tailwind.config.ts` and maps all design tokens to Tailwind's theme. Any updates to `packages/design-tokens/index.ts` will automatically be reflected in Tailwind utilities.

## Auth UI (UTA-69, Story 21)

Web sign-in / sign-out / recover-access screens wired to the UTA-67
Route Handlers. Design tokens via Tailwind; copy in `src/lib/auth-copy.ts`
(EN default + ID).

| Route                     | Screen                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/sign-in`                | Sign-in form; generic error on failure (no enumeration); `?expired=1` re-auth notice after 30m web idle, `?signedOut=1` after sign-out |
| `/forgot-password`        | Recover-access request; always the same generic success shape                                                                          |
| `/reset-password?token=…` | New-password confirm (min 8 + denylist, server-enforced)                                                                               |
| `/sessions`               | Active sessions list, sign out this device / all devices, security-activity affordance; 401s redirect to `/sign-in?expired=1`          |

Client calls live in `src/lib/auth-client.ts`: `credentials:
"same-origin"` so the HttpOnly `tb_session` cookie rides along; opaque
tokens are never stored in JS or logged. Components are in
`src/components/auth/`.

### Run against the local / fixture API

Without `DATABASE_URL` the auth routes use process-local memory stores
(`storage: "memory"` in responses). Seed one login in a dev console, then
use its workspace ID in the sign-in form:

```ts
import { __resetAuthForTests, seedFixtureCredential } from '@/lib/auth';

__resetAuthForTests();
const { workspaceId } = await seedFixtureCredential({
  email: 'owner@fixture.test',
  password: 'sari-roti-88!',
});
```

```bash
pnpm --filter @tokoboss/web dev
# open http://localhost:3000/sign-in
```

Password-reset tickets need a mailer in production; locally start dev with
`AUTH_INCLUDE_RESET_TOKEN=true` to receive the single-use ticket from
`POST /api/auth/password-reset/request`, then paste it as
`/reset-password?token=<ticket>`. Resetting revokes all sessions.

### Bootstrap a user through the API

Set `AUTH_BOOTSTRAP_PASSWORD` to a long random server-only value. Then call
`POST /api/auth/bootstrap-users` with that value in the
`X-Bootstrap-Password` header and a body containing `email`, `password`, and
an optional `workspaceName`. The endpoint creates a workspace and its initial
Admin account, returning `workspaceId` for the normal sign-in endpoint. It is
disabled when the environment variable is unset. Import the tracked `yaak/`
folder into Yaak for ready-made bootstrap and sign-in requests.

### Tests

```bash
pnpm --filter @tokoboss/web test      # route (auth.test.ts, invite-members.test.ts, profile.test.ts, catalog.test.ts) + UI clients (auth-ui.test.ts, team-ui.test.ts, profile-ui.test.ts, produk-ui.test.ts)
pnpm --filter @tokoboss/web typecheck # must pass before push
```

## Team & Access UI (UTA-71, Story 19)

Admin-only team management over the UTA-70 invite/membership APIs.
Design tokens via Tailwind; copy in `src/lib/team-copy.ts` (EN default +
ID); browser calls in `src/lib/team-client.ts` (`credentials:
"same-origin"` so the HttpOnly `tb_session` cookie rides along — no tokens
in JS storage or logs).

| Route            | Screen                                                                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/team`          | Workspace loader, invite-create form (email + role + warehouse scope), member list with role/scope save + deactivate-with-confirm, pending invites with revoke, last-Admin warning |
| `/accept-invite` | Token-gated accept form (`?token=` prefill); optional new password for first sign-in                                                                                               |

Rules reflected in UX: Admin invites/updates force an empty warehouse scope
(server re-enforces); the last active Admin's row is locked in the UI (role,
scope, save, and deactivate controls render disabled with banner + badge,
and demote/deactivate handlers no-op with the dedicated message) with the
server 409 (`TENANCY_LAST_ADMIN`) as the authority for stale lists; unknown/consumed tickets share one generic
invalid message and expired tickets their own; the create-response ticket
renders once with a copy button and is never logged.

### Local preview runbook (memory mode, no `DATABASE_URL`)

```bash
pnpm --filter @tokoboss/web dev
# 1. Open http://localhost:3000/sign-in and sign in as a seeded Admin
#    (seed via `seedFixtureCredential` as above; copy its workspace ID).
# 2. Open http://localhost:3000/team, paste the workspace ID, Load team.
# 3. Invite a teammate (role staff/manager + optional scope `wh_jkt_1`);
#    copy the once-only ticket.
# 4. In a private window open http://localhost:3000/accept-invite?token=<ticket>,
#    accept with a new password, then sign in as the new member.
# 5. Back as Admin on /team: change a role/scope (Save), revoke a pending
#    invite, deactivate a member (confirm) — the last active Admin stays
#    protected with a warning + error.
```

## Profil UI (UTA-73, Story 25)

Personal profile over the UTA-72 read/update + change-password APIs
(UTA-67 sessions read-only below). Design tokens via Tailwind; copy in
`src/lib/profile-copy.ts` (EN default + ID); browser calls in
`src/lib/profile-client.ts` (`credentials: "same-origin"` so the HttpOnly
session cookie rides along — no tokens in JS storage or logs).

| Route      | Screen                                                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/profil`  | Canonical Profil screen: header (avatar initial + display name + email), profile form (display name + optional avatar upload ID), change-password form (current + new + confirm), active-sessions card via shared `SessionsPanel` |
| `/profile` | English alias rendering the same panel                                                                                                                                                                                            |

Entry matches the approved mockup: the bottom-left overflow menu (global
`AppNav` in the root layout) shows `•••` on desktop and `Lainnya` on
mobile; the menu links to Profil, Active sessions, Team & Access, and
Sign in. The home page also links to `/profil`.

Rules reflected in UX: profile reads/updates hit `GET`/`PATCH
/api/auth/me` (own profile only — no target-user parameter; avatar IDs
stay opaque references, never bytes or URLs); wrong current passwords map
to one generic message; weak replacements surface the server policy
detail; any 401 `INVALID_SESSION` redirects to `/sign-in?expired=1`;
password change revokes ALL sessions and clears the cookie, so success
redirects to re-auth with a notice.

### Local preview runbook (memory mode, no `DATABASE_URL`)

```bash
pnpm --filter @tokoboss/web dev
# 1. Sign in at http://localhost:3000/sign-in as a seeded user
#    (seed via `seedFixtureCredential` as above; copy its workspace ID).
# 2. Open http://localhost:3000/profil via the bottom-left ••• / Lainnya
#    menu — header shows the avatar initial + email.
# 3. Save a display name (e.g. Budi Santoso); optionally paste a completed
#    avatar `file_uploads` ID from the same workspace (unknown IDs → 403).
# 4. Change password (current + new + confirm): weak values → policy error,
#    wrong current → generic error, success → redirect to /sign-in?expired=1
#    (all sessions revoked, cookie cleared) — sign back in with the new value.
# 5. Sessions card below mirrors /sessions (this-device badge, sign out
#    this/all, security-activity note).
```

With `DATABASE_URL` set the same screens run against Postgres (Drizzle
stores); without it responses carry `storage: "memory"` for fixture
evidence.

## Produk & Stok UI (UTA-76, Story 01 web)

Product list + right-side SKU drawer over the UTA-75 catalog APIs.
Design tokens via Tailwind; copy in `src/lib/catalog-copy.ts` (EN default +
ID); browser calls in `src/lib/catalog-client.ts` (`credentials:
"same-origin"` so the HttpOnly session cookie rides along — no tokens in
JS storage or logs).

| Route     | Screen                                                                                                                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/produk` | Workspace loader, cross-identifier search (name / SKU TokoBoss / barcode / Store SKU hint / listing name), dense product rows (primary SKU, prices, total stock, status), create (≥1 variant), confirm-gated archive, SKU drawer overlay (list stays open) |
| `/produk/impor` | Import review (UTA-78, Story 02): workspace loader, CSV/file upload (or pre-parsed rows JSON), batch list with status + counters, reviewable row table (errors, duplicates with `existingPath`, Store SKU as mapping candidate only), row edit/reject, batch reject/reopen, confirm-before-create into the catalog |

Rules reflected in UX: search hits one query across every identifier;
the drawer keeps SKU TokoBoss visually primary with editable details
(price, HPP/cost-source, barcode, listing name, unit, pictures as opaque
upload IDs), Admin-only SKU-code edit with the locked note after stock
or mappings (server 422), read-only Store mappings (no live channel
calls), per-warehouse quantities, and an adjustment form that requires
warehouse + non-zero delta + reason before saving straight to the
ledger; duplicates surface the conflict copy with the existing-product
route; Manager/Admin write, Staff reads (+ scoped drawer adjustments);
401 `INVALID_SESSION` redirects to `/sign-in?expired=1`. Full runbook:
`src/components/catalog/RUNBOOK.md`.

Import review rules reflected in UX (`/produk/impor`, entered from
`/produk`): review-before-create only — nothing touches the catalog
until confirm; row edits re-validate server-side and the batch detail is
re-read after every mutation so counters stay honest; confirm creates
via the catalog rules with applied / duplicates (`existingPath`, never
overwritten) / skipped summary; Store SKU text is a mapping candidate
only and never the TokoBoss identity; no live marketplace calls. Full
runbook: `src/components/imports/RUNBOOK.md`.

### Local preview runbook (memory mode, no `DATABASE_URL`)

```bash
pnpm --filter @tokoboss/web dev
# 1. Sign in at http://localhost:3000/sign-in as a seeded user
#    (seed via `seedFixtureCredential` as above; copy its workspace ID).
# 2. Open http://localhost:3000/produk via the bottom-left ••• / Lainnya
#    menu, paste the workspace ID, Load products.
# 3. Create a product (name + SKU TokoBoss + price); re-creating the same
#    SKU shows the duplicate copy with the existing-product route.
# 4. Search any identifier, open the drawer (list stays open), edit
#    details, adjust stock (warehouse + delta + reason), watch the ledger.
# 5. Archive (confirm) — the row flips to Archived with history intact.
```

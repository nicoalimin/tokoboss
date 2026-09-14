# TokoBoss Mobile (UTA-13)

Expo Router client shell for iOS/Android. Consumes the Next.js BFF over
**versioned authenticated HTTP** (`/api/v1/...`) with payloads validated
against `@tokoboss/contracts`. Next.js remains the BFF — mobile **never**
calls Server Actions (enforced by `src/__tests__/guardrails.test.ts`).

## Run iOS / Android dev builds

```bash
# from repo root
pnpm install
pnpm --filter @tokoboss/mobile start   # or: cd mobile && pnpm start
```

Then press `i` (iOS simulator) or `a` (Android emulator), or scan the QR
code with Expo Go. First run on a simulator:

```bash
pnpm --filter @tokoboss/mobile ios      # expo start --ios
pnpm --filter @tokoboss/mobile android  # expo start --android
```

What you should see: signed-out → **Sign in** screen (mock auth);
after sign-in → **TokoBoss home shell** with “Check BFF health”,
“Load my session (authenticated)”, “Open devices demo”, “Open settings”.

> Full EAS builds (`eas build --profile development|staging|preview`)
> are optional/manual until signing secrets exist — see `eas.json`.
> There is deliberately no `production` profile yet: production
> credentials are out of scope, so no profile may imply prod access.
> CI runs lint + typecheck + vitest, not native builds.

## Environment selection

Only `EXPO_PUBLIC_*` values are read (they ship in the bundle — never
put secrets here). Copy `.env.example` to `.env`:

| Variable                   | Values                                    | Notes                                                                         |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `EXPO_PUBLIC_APP_ENV`      | `dev` (default) \| `staging` \| `preview` | build flavor                                                                  |
| `EXPO_PUBLIC_API_BASE_URL` | URL                                       | defaults to `http://localhost:3000` in `dev`; **required** in staging/preview |

Resolution lives in `src/env/index.ts` (`resolveMobileEnv()`); iOS and
Android share it. Bundle ids: iOS `app.tokoboss.mobile`, Android
`app.tokoboss.mobile` (`app.json`); deep-link scheme `tokoboss://`.

For the BFF calls to succeed locally, run web alongside:
`pnpm --filter @tokoboss/web dev` (or `pnpm dev` from root).

## API client + session ports

```
src/api/client.ts            typed fetch client (versioned routes only)
src/session/ports.ts         SecureSessionStore + SessionRefreshPort
src/session/manager.ts       signed-in/out state machine, 1× auto-refresh
src/session/expo-secure-store.adapter.ts   production backing (Keychain / EncryptedSharedPreferences)
src/session/memory.adapter.ts              insecure, tests/previews only
src/session/refresh.adapter.ts             BFF POST /api/v1/session/refresh
src/session/provider.tsx     React glue: SessionProvider + useSession()
```

- Routes come from the shared table (`ApiRoutes` in
  `@tokoboss/contracts`); anything outside `/api/v1/` throws before
  hitting the network.
- Responses are zod-validated against shared contracts
  (`HealthResponseSchema`, `SessionResponseSchema`, …).
- `Authorization: Bearer …` is attached per request; on 401 the client
  refreshes once via `SessionRefreshPort`, then fails closed (cleared
  storage → signed-out shell).
- Tokens never reach logs: the `onEvent` hook carries redacted metadata
  via `@tokoboss/observability` (`redact()`), asserted in tests.
- No provider SDK in mobile: sign-in goes through the `@tokoboss/auth`
  ports (`MockAuthProvider` today; Clerk/Auth0/etc. slot in later).

## Secure storage approach

| Layer                    | iOS                                                                         | Android                                            |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------- |
| `ExpoSecureSessionStore` | Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (no backup, locked-inaccessible) | EncryptedSharedPreferences (AES-256-GCM, Keystore) |

Corrupt/tampered entries fail closed (treated as absent → signed out).
A static test bans `@react-native-async-storage/async-storage` and
`console.log` of token material under `app/` + `src/`.

## Device adapters (stubs)

`src/devices/ports.ts` defines camera, barcode, photo-upload,
notifications, and deep-link ports; `src/devices/stubs.ts` provides
deterministic fakes. Denial never throws — adapters return
`{ ok: false, reason: 'permission-denied', recovery: '…' }` and the
Devices screen (`app/(app)/devices.tsx`) renders the recovery copy
inline with a retry path. Toggle grant/deny on the screen to demo it.

## Design tokens

`src/theme/tokens.ts` maps `@tokoboss/design-tokens` (pastel palette,
compact 4px spacing, 44×44 iOS / 48×48 Android minimums, icon sizes) to
React Native numbers. Primary actions use 52pt targets with
`maxFontSizeMultiplier={1.3}` so small-screen + large-text rendering
keeps actions on screen. Screens use `testID`s (`sign-in-submit`,
`home-primary-actions`, `devices-recovery`, …) for smoke tests.

## Checks

```bash
pnpm --filter @tokoboss/mobile lint
pnpm --filter @tokoboss/mobile typecheck
pnpm --filter @tokoboss/mobile test
pnpm --filter @tokoboss/mobile build   # expo export (iOS + Android + web bundles)
```

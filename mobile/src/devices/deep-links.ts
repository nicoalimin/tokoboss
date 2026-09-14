/**
 * Deep-link parsing (UTA-13).
 *
 * Scheme `tokoboss://` is reserved in `app.json` for iOS (URL scheme) and
 * Android (intent filter). Parsing is pure so it is unit-testable without
 * native linking modules; the UI layer feeds it URLs from Expo Router /
 * `expo-linking` listeners.
 *
 * Supported shapes:
 * - `tokoboss://home`, `tokoboss://settings`, `tokoboss://devices`
 * - `tokoboss://sign-in?next=/devices`
 */

import type { DeepLink, DeepLinkPort } from './ports';

const SCHEME = 'tokoboss://';

const SCREENS = ['home', 'settings', 'devices', 'sign-in'] as const;
type Screen = (typeof SCREENS)[number];

function isScreen(value: string): value is Screen {
  return (SCREENS as readonly string[]).includes(value);
}

export function parseDeepLink(url: string): DeepLink | null {
  try {
    if (!url.startsWith(SCHEME)) return null;
    const rest = url.slice(SCHEME.length);
    const [rawPath = '', rawQuery = ''] = rest.split('?');
    const screen = rawPath.replace(/\/+$/, '') || 'home';
    if (!isScreen(screen)) return null;
    const params: Record<string, string> = {};
    if (rawQuery) {
      for (const pair of rawQuery.split('&')) {
        const [k = '', v = ''] = pair.split('=');
        if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
      }
    }
    return { screen, params };
  } catch {
    return null;
  }
}

export const deepLinkPort: DeepLinkPort = { parse: parseDeepLink };

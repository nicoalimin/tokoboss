/**
 * Production secure-session adapter (UTA-13).
 *
 * Backed by `expo-secure-store`:
 * - iOS: Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly` — no
 *   iCloud backup, no access while locked).
 * - Android: EncryptedSharedPreferences (AES-256-GCM via Android Keystore).
 *
 * Session data never touches plain AsyncStorage or logs. Corrupt entries
 * are treated as absent (fail closed → signed-out shell).
 */

import * as SecureStore from 'expo-secure-store';
import { SessionTokensSchema, type SessionTokens } from '@tokoboss/contracts';
import type { SecureSessionStore } from './ports';

const SESSION_KEY = 'tokoboss.session.v1';

export class ExpoSecureSessionStore implements SecureSessionStore {
  async saveSession(tokens: SessionTokens): Promise<void> {
    const validated = SessionTokensSchema.parse(tokens);
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(validated), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }

  async loadSession(): Promise<SessionTokens | null> {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    try {
      const parsed = SessionTokensSchema.safeParse(JSON.parse(raw));
      // Fail closed: tampered/corrupt entries sign the user out.
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async clearSession(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

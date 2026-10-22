/**
 * Marketplace credential vault (US20 / RFC 04 task 82a): the application
 * `CredentialVault` port over the sealed-blob repository (task 68) and the
 * AES-256-GCM `SecretBox` (task 47). Credentials are JSON-encoded and
 * sealed with AAD `connection_id|kind`; plaintext is never logged.
 */
import type { CredentialKind, CredentialVault } from '@tokoboss/application';
import type { DrizzleMarketplaceStore } from '@tokoboss/database';
import type { MarketplaceCredentials } from '@tokoboss/domain';
import {
  SecretBox,
  SecretBoxError,
  credentialAad,
  parseSecretBoxKey,
} from '@tokoboss/integrations';

/** The sealed-blob repository surface the vault needs (task 68). */
export type CredentialBlobStore = Pick<
  DrizzleMarketplaceStore['credentials'],
  'put' | 'get' | 'shred'
>;

/** An authentic blob that does not decode counts as tampered. */
const unreadable = () => new SecretBoxError('SECRET_BOX_TAMPERED');

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw unreadable();
  return date;
}

function encode(credentials: MarketplaceCredentials): string {
  return JSON.stringify({
    secrets: { ...credentials.secrets },
    grantedScopes: [...credentials.grantedScopes],
    accessTokenExpiresAt:
      credentials.accessTokenExpiresAt?.toISOString() ?? null,
    authExpiresAt: credentials.authExpiresAt?.toISOString() ?? null,
  });
}

function decode(plaintext: string): MarketplaceCredentials {
  let raw: Record<string, unknown> | null;
  try {
    raw = JSON.parse(plaintext) as Record<string, unknown> | null;
  } catch {
    throw unreadable();
  }
  const secrets = raw?.['secrets'];
  const scopes = raw?.['grantedScopes'];
  const ok =
    typeof secrets === 'object' &&
    secrets !== null &&
    isStringList(Object.values(secrets)) &&
    isStringList(scopes);
  if (!raw || !ok) throw unreadable();
  return {
    secrets: { ...(secrets as Record<string, string>) },
    grantedScopes: [...scopes],
    accessTokenExpiresAt: toDate(raw['accessTokenExpiresAt']),
    authExpiresAt: toDate(raw['authExpiresAt']),
  };
}

/** `CredentialVault` sealing with `SecretBox`; one blob per connection. */
export class SecretBoxCredentialVault implements CredentialVault {
  constructor(
    private readonly blobs: CredentialBlobStore,
    private readonly box: SecretBox
  ) {}

  async seal(
    connectionId: string,
    kind: CredentialKind,
    credentials: MarketplaceCredentials
  ): Promise<void> {
    const aad = credentialAad(connectionId, kind);
    const sealed = this.box.seal(encode(credentials), aad);
    await this.blobs.put(connectionId, { kind, ...sealed });
  }

  /** Null when nothing is sealed (never connected, or shredded). */
  async open(connectionId: string): Promise<MarketplaceCredentials | null> {
    const blob = await this.blobs.get(connectionId);
    if (!blob) return null;
    const aad = credentialAad(connectionId, blob.kind);
    return decode(this.box.open(blob, aad));
  }

  shred(connectionId: string): Promise<void> {
    return this.blobs.shred(connectionId);
  }
}

/** Ship dark: null unless both MARKETPLACE_CREDENTIALS_KEY(_ID) are set. */
export function secretBoxFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): SecretBox | null {
  const key = env['MARKETPLACE_CREDENTIALS_KEY'];
  const keyId = env['MARKETPLACE_CREDENTIALS_KEY_ID'];
  if (!key || !keyId) return null;
  return new SecretBox(parseSecretBoxKey(keyId, key));
}

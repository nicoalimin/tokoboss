import type { MarketplaceCredentials } from '@tokoboss/domain';
import type {
  CredentialKind,
  OAuthStateRecord,
  StoreClaimRecord,
} from './integration-port-inputs';
import type {
  CredentialVault,
  OAuthStateStore,
  StoreClaimStore,
} from './integration-ports';

type StoreKey = Pick<StoreClaimRecord, 'provider' | 'providerStoreId'>;

/**
 * In-memory CredentialVault test fake (US20, RFC 04 task 34b). Keeps
 * sealed credentials per connection; `shred` deletes them for good.
 */
export class InMemoryCredentialVault implements CredentialVault {
  readonly sealed = new Map<
    string,
    { kind: CredentialKind; credentials: MarketplaceCredentials }
  >();

  async seal(
    connectionId: string,
    kind: CredentialKind,
    credentials: MarketplaceCredentials
  ) {
    this.sealed.set(connectionId, { kind, credentials: { ...credentials } });
  }

  async open(connectionId: string) {
    const entry = this.sealed.get(connectionId);
    return entry ? { ...entry.credentials } : null;
  }

  async shred(connectionId: string) {
    this.sealed.delete(connectionId);
  }
}

/** In-memory OAuthStateStore: single use, rejects expired states. */
export class InMemoryOAuthStateStore implements OAuthStateStore {
  readonly states = new Map<string, OAuthStateRecord>();

  async create(record: OAuthStateRecord, stateHash: string) {
    this.states.set(stateHash, { ...record });
  }

  async consume(stateHash: string, now: Date) {
    const row = this.states.get(stateHash);
    if (!row || row.consumedAt !== null || row.expiresAt <= now) return null;
    const used = { ...row, consumedAt: now };
    this.states.set(stateHash, used);
    return { ...used };
  }
}

/**
 * In-memory StoreClaimStore: one global owner per provider store, like
 * SQL ON CONFLICT DO NOTHING. A losing `acquire` returns the owner row.
 */
export class InMemoryStoreClaimStore implements StoreClaimStore {
  readonly claims = new Map<string, StoreClaimRecord>();

  async find(key: StoreKey) {
    const row = this.claims.get(claimKey(key));
    return row ? { ...row } : null;
  }

  async acquire(claim: StoreClaimRecord) {
    const key = claimKey(claim);
    const owner = this.claims.get(key);
    if (owner) return { ...owner };
    this.claims.set(key, { ...claim });
    return { ...claim };
  }

  async release(key: StoreKey & { workspaceId: string }) {
    const owner = this.claims.get(claimKey(key));
    if (!owner || owner.workspaceId !== key.workspaceId) return false;
    this.claims.delete(claimKey(key));
    return true;
  }
}

function claimKey(key: StoreKey) {
  return `${key.provider}:${key.providerStoreId}`;
}

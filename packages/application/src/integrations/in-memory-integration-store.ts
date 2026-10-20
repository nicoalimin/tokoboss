import {
  InMemoryCredentialVault,
  InMemoryOAuthStateStore,
  InMemoryStoreClaimStore,
} from './in-memory-auth-stores';
import { InMemoryConnectionStore } from './in-memory-connection-store';
import {
  InMemoryInboundEventStore,
  InMemoryOrderPreviewStore,
} from './in-memory-event-stores';
import { InMemoryListingStore } from './in-memory-listing-store';

/** Every store a US20 transaction body may touch. */
export interface InMemoryIntegrationTx {
  connections: InMemoryConnectionStore;
  vault: InMemoryCredentialVault;
  claims: InMemoryStoreClaimStore;
  listings: InMemoryListingStore;
}

/**
 * In-memory aggregate of all US20 integration ports (RFC 04 task 34e) for
 * use-case tests. `transaction` runs the body against the same stores and
 * restores connections, vault, claims and listings when it throws, like a
 * SQL rollback. It is an arrow property so `{ ...store }` keeps it.
 */
export class InMemoryIntegrationStore implements InMemoryIntegrationTx {
  readonly connections = new InMemoryConnectionStore();
  readonly vault = new InMemoryCredentialVault();
  readonly oauthStates = new InMemoryOAuthStateStore();
  readonly claims = new InMemoryStoreClaimStore();
  readonly events = new InMemoryInboundEventStore();
  readonly listings = new InMemoryListingStore();
  readonly orderPreviews = new InMemoryOrderPreviewStore();
  /** Transactions started, so tests can assert one write transaction. */
  transactions = 0;

  readonly transaction = async <T>(
    fn: (tx: InMemoryIntegrationTx) => Promise<T>
  ): Promise<T> => {
    this.transactions += 1;
    const restore = this.snapshot();
    try {
      return await fn(this);
    } catch (err) {
      restore();
      throw err;
    }
  };

  private snapshot() {
    const maps: Map<string, object>[] = [
      this.connections.rows,
      this.vault.sealed,
      this.claims.claims,
      this.listings.listings,
      this.listings.locations,
    ];
    const copies = maps.map((m) => [...m].map(([k, v]) => [k, { ...v }]));
    const mappings = this.listings.mappings.map((m) => ({ ...m }));
    return () => {
      maps.forEach((m, i) => {
        m.clear();
        for (const [k, v] of copies[i] as [string, object][]) m.set(k, v);
      });
      this.listings.mappings.splice(0, Infinity, ...mappings);
    };
  }
}

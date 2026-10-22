/**
 * Marketplace integrations wiring for Route Handlers (US20 / RFC 04 task
 * 82c). Stores mirror `@/lib/stock-count`: Postgres (`DATABASE_URL` set)
 * through `DrizzleMarketplaceStore` plus a transaction adapter, otherwise a
 * process-local `InMemoryIntegrationStore`. The Postgres vault seals with
 * `SecretBox` (82a); with no MARKETPLACE_CREDENTIALS_KEY seal/open throw.
 */
import {
  DrizzleMarketplaceStore,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryIntegrationStore,
  createJob,
  providerNotAvailable,
  type ConnectionStore,
  type CredentialVault,
  type InboundEventStore,
  type ListingStore,
  type NewJobInput,
  type OAuthStateStore,
  type OrderPreviewStore,
  type StoreClaimStore,
} from '@tokoboss/application';
import { getAuthAudit, storageKind } from '@/lib/auth';
import {
  SecretBoxCredentialVault,
  secretBoxFromEnv,
} from '@/lib/integration-vault';
import {
  __resetConnectorRegistryForTests,
  getConnectorRegistry,
  redirectUri,
} from '@/lib/integration-registry';
import { getJobTxRunner } from '@/lib/jobs';

export { getAuthAudit as getIntegrationAudit, storageKind } from '@/lib/auth';

/** Every store a US20 transaction body may touch. */
export interface IntegrationTx {
  connections: ConnectionStore;
  vault: CredentialVault;
  claims: StoreClaimStore;
  listings: ListingStore;
}

export interface IntegrationStore extends IntegrationTx {
  oauthStates: OAuthStateStore;
  events: InboundEventStore;
  orderPreviews: OrderPreviewStore;
  transaction<T>(fn: (tx: IntegrationTx) => Promise<T>): Promise<T>;
}

let dbHandle: DbHandle | null = null;
let memory: InMemoryIntegrationStore | null = null;

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

/** Key resolved per call, so routes that never seal work without it. */
function sealedVault(store: DrizzleMarketplaceStore): CredentialVault {
  const vault = () => {
    const box = secretBoxFromEnv();
    if (!box) throw new Error('MARKETPLACE_CREDENTIALS_KEY is not set');
    return new SecretBoxCredentialVault(store.credentials, box);
  };
  return {
    seal: (id, kind, credentials) => vault().seal(id, kind, credentials),
    open: (id) => vault().open(id),
    shred: (id) => store.credentials.shred(id),
  };
}

/** Transaction adapter: the body's ports all share one SQL transaction. */
function fromDrizzle(store: DrizzleMarketplaceStore): IntegrationStore {
  return {
    connections: store.connections,
    vault: sealedVault(store),
    oauthStates: store.oauthStates,
    claims: store.claims,
    events: store.events,
    listings: store.listings,
    orderPreviews: store.orderPreviews,
    transaction: (fn) => store.transaction((tx) => fn(fromDrizzle(tx))),
  };
}

export function getIntegrationStore(): IntegrationStore {
  if (storageKind() === 'postgres') {
    return fromDrizzle(new DrizzleMarketplaceStore(getDbHandle().db));
  }
  return (memory ??= new InMemoryIntegrationStore());
}

/** Reset in-memory integration state and the cached connector registry. */
export function __resetIntegrationsForTests(): void {
  if (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  ) {
    throw new Error('Refusing fixture reset in production');
  }
  memory = new InMemoryIntegrationStore();
  __resetConnectorRegistryForTests();
}

/** Deps for every US20 use case: store ports, audit, registry and clock. */
export function getIntegrationDeps() {
  const registry = getConnectorRegistry();
  return {
    ...getIntegrationStore(),
    audit: getAuthAudit(),
    enabledProviders: registry.enabledProviders,
    connectorFor: (provider: string) => {
      const connector = registry.get(provider);
      if (!connector) throw providerNotAvailable();
      return connector;
    },
    redirectUri,
    newId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}

/** Enqueue a durable integration job (import, refresh) via `@/lib/jobs`. */
export function enqueueIntegrationJob(input: NewJobInput) {
  return createJob(getJobTxRunner(), input);
}

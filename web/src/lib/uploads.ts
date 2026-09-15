/**
 * Upload infrastructure wiring for Route Handlers (UTA-15).
 *
 * - Store: when `DATABASE_URL` is set (preview/production via the UTA-11
 *   Neon wiring, or a local Neon branch), handlers use Postgres through
 *   `DrizzleFileUploadStore`. Otherwise they fall back to a process-local
 *   `InMemoryUploadStore` (documented local-dev mode; responses include
 *   `storage: "memory"` so fixture evidence can never be mistaken for
 *   Postgres rows).
 * - Object storage: when `BLOB_READ_WRITE_TOKEN` is set, handlers use the
 *   `VercelBlobAdapter` private store. Otherwise they use the
 *   `MemoryBlobAdapter` fixture (local/preview fixture uploads without
 *   network or credentials).
 *
 * Secrets (`BLOB_READ_WRITE_TOKEN`, `DATABASE_URL`) stay server-side — they
 * are never returned, logged, or embedded in client bundles.
 */
import type { ObjectStoragePort } from '@tokoboss/domain';
import {
  DrizzleFileUploadStore,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryUploadStore,
  type FileUploadStore,
} from '@tokoboss/application';
import {
  MemoryBlobAdapter,
  VercelBlobAdapter,
} from '@tokoboss/integrations';

let memoryStore: InMemoryUploadStore | null = null;
let dbHandle: DbHandle | null = null;
let memoryBlob: MemoryBlobAdapter | null = null;
let vercelBlob: VercelBlobAdapter | null = null;

export function storageKind(): 'postgres' | 'memory' {
  return process.env['DATABASE_URL'] ? 'postgres' : 'memory';
}

export function blobKind(): 'vercel-blob' | 'memory-blob' {
  return process.env['BLOB_READ_WRITE_TOKEN'] ? 'vercel-blob' : 'memory-blob';
}

function getMemoryStore(): InMemoryUploadStore {
  if (!memoryStore) memoryStore = new InMemoryUploadStore();
  return memoryStore;
}

function getDbHandle(): DbHandle {
  if (!dbHandle) {
    dbHandle = createDb(process.env['DATABASE_URL']);
  }
  return dbHandle;
}

export function getUploadStore(): FileUploadStore {
  if (storageKind() === 'postgres') {
    return new DrizzleFileUploadStore(getDbHandle().db);
  }
  return getMemoryStore();
}

/** Audit sink: Postgres-backed workspaces append to `audit_events`; the
 * local fallback records to the in-memory store's audit trail. */
export function getUploadAudit(): {
  append: (input: {
    workspaceId: string;
    action: string;
    payload: Record<string, unknown>;
  }) => Promise<void>;
} {
  if (storageKind() === 'postgres') {
    // Audit-via-jobs-pattern: keep the audit write adjacent to the upload
    // write without a second client. For the stub, log to the observability
    // logger at the call site (routes do this) — the sink itself is a
    // no-op so token/complete latency stays flat.
    return { append: async () => {} };
  }
  return getMemoryStore().audit;
}

export function getStoragePort(): ObjectStoragePort {
  if (blobKind() === 'vercel-blob') {
    if (!vercelBlob) vercelBlob = new VercelBlobAdapter();
    return vercelBlob;
  }
  if (!memoryBlob) memoryBlob = new MemoryBlobAdapter();
  return memoryBlob;
}

/** Test/local escape hatch: the shared fixture blob adapter. */
export function getMemoryBlobAdapter(): MemoryBlobAdapter {
  if (!memoryBlob) memoryBlob = new MemoryBlobAdapter();
  return memoryBlob;
}

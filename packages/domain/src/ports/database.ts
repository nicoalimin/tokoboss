/**
 * Database port (domain-level contract for transactional work)
 *
 * Infrastructure (`@tokoboss/database`) provides concrete implementations:
 * - Drizzle + Neon Postgres adapter (real persistence)
 * - In-memory adapter (tests, no credentials required)
 *
 * The domain layer must never import Drizzle, Neon, or any driver directly.
 * All transactional use cases go through this port.
 */

/**
 * Store input for transactional creation
 */
export interface CreateStoreInput {
  id: string;
  name: string;
}

/**
 * Product input for transactional creation
 */
export interface CreateProductInput {
  id: string;
  storeId: string;
  sku: string;
  name: string;
  priceCents: number;
}

/**
 * Stock move input for transactional creation (append-only ledger)
 */
export interface CreateStockMoveInput {
  id: string;
  productId: string;
  qty: number;
  reason: string;
}

/**
 * Transactional context available inside `withTransaction`.
 * Implementations must guarantee atomicity: either all writes commit
 * or all writes roll back.
 */
export interface DatabaseTransaction {
  createStore(input: CreateStoreInput): Promise<void>;
  createProduct(input: CreateProductInput): Promise<void>;
  createStockMove(input: CreateStockMoveInput): Promise<void>;
  countProducts(): Promise<number>;
}

/**
 * Database port — the only way application code touches persistence
 * transactionally. Non-transactional reads/writes continue to use the
 * generic `Repository<T, ID>` port.
 */
export interface DatabasePort {
  withTransaction<T>(fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T>;
  ping(): Promise<void>;
}

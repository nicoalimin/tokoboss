/**
 * Database port (UTA-10).
 *
 * Transaction-capable database abstraction. Infrastructure adapters
 * (Drizzle/Neon, in-memory test double) implement this port; application
 * code depends only on the interface, never on a concrete driver.
 *
 * Transaction semantics:
 * - `transaction` commits when `fn` resolves and rolls back when it rejects.
 * - Nested `transaction` calls join the ambient transaction (savepoint
 *   semantics for real drivers, single staged unit for the in-memory double).
 */
export interface DatabasePort {
  /**
   * Execute `fn` inside a single transaction.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Liveness probe. Resolves when the database is reachable.
   */
  ping(): Promise<void>;

  /**
   * Release underlying resources (pools, connections).
   */
  close(): Promise<void>;
}

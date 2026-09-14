import type { DatabasePort } from '@tokoboss/domain';

/** Thrown when a `withTransaction` unit of work fails and is rolled back. */
export class TransactionFailedError extends Error {
  readonly operation: string;

  constructor(operation: string, cause: unknown) {
    super(`transaction '${operation}' failed and was rolled back`, { cause });
    this.name = 'TransactionFailedError';
    this.operation = operation;
  }
}

/**
 * Transaction wrapper (UTA-10).
 * Runs `fn` in a single transaction on any `DatabasePort` and wraps
 * failures with the operation name while preserving the original cause.
 */
export async function withTransaction<T>(
  db: DatabasePort,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await db.transaction(fn);
  } catch (error) {
    if (error instanceof TransactionFailedError) {
      throw error;
    }
    throw new TransactionFailedError(operation, error);
  }
}

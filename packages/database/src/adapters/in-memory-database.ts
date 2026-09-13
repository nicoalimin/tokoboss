import type {
  CreateProductInput,
  CreateStockMoveInput,
  CreateStoreInput,
  DatabasePort,
  DatabaseTransaction,
} from '@tokoboss/domain';

/**
 * In-memory `DatabasePort` implementation.
 *
 * - Used by unit/integration tests: no credentials, no network.
 * - Implements real transaction semantics via snapshot/restore so the
 *   transaction integration test exercises commit + rollback paths
 *   through the same port the Drizzle adapter implements.
 */
interface InMemoryState {
  stores: Map<string, CreateStoreInput>;
  products: Map<string, CreateProductInput>;
  stockMoves: Map<string, CreateStockMoveInput>;
}

function cloneState(state: InMemoryState): InMemoryState {
  return {
    stores: new Map(state.stores),
    products: new Map(state.products),
    stockMoves: new Map(state.stockMoves),
  };
}

function createTx(state: InMemoryState): DatabaseTransaction {
  return {
    async createStore(input: CreateStoreInput): Promise<void> {
      if (state.stores.has(input.id)) {
        throw new Error(`Store with id ${input.id} already exists`);
      }
      state.stores.set(input.id, { ...input });
    },
    async createProduct(input: CreateProductInput): Promise<void> {
      if (!state.stores.has(input.storeId)) {
        throw new Error(`Store with id ${input.storeId} does not exist`);
      }
      if (state.products.has(input.id)) {
        throw new Error(`Product with id ${input.id} already exists`);
      }
      for (const existing of state.products.values()) {
        if (existing.storeId === input.storeId && existing.sku === input.sku) {
          throw new Error(
            `Product with sku ${input.sku} already exists in store ${input.storeId}`
          );
        }
      }
      state.products.set(input.id, { ...input });
    },
    async createStockMove(input: CreateStockMoveInput): Promise<void> {
      if (!state.products.has(input.productId)) {
        throw new Error(`Product with id ${input.productId} does not exist`);
      }
      if (state.stockMoves.has(input.id)) {
        throw new Error(`Stock move with id ${input.id} already exists`);
      }
      state.stockMoves.set(input.id, { ...input });
    },
    async countProducts(): Promise<number> {
      return state.products.size;
    },
  };
}

export class InMemoryDatabase implements DatabasePort {
  private state: InMemoryState = {
    stores: new Map(),
    products: new Map(),
    stockMoves: new Map(),
  };

  async withTransaction<T>(
    fn: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    const snapshot = cloneState(this.state);
    try {
      const result = await fn(createTx(this.state));
      return result;
    } catch (error) {
      this.state = snapshot;
      throw error;
    }
  }

  async ping(): Promise<void> {
    return;
  }

  /** Test helper: read committed product count outside a transaction. */
  async countProductsCommitted(): Promise<number> {
    return this.state.products.size;
  }

  /** Test helper: reset all state. */
  async reset(): Promise<void> {
    this.state = {
      stores: new Map(),
      products: new Map(),
      stockMoves: new Map(),
    };
  }
}

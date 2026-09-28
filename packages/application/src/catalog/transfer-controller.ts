import {
  TransferStockInput,
  TransferResult,
  transferStock,
} from './transfer-use-cases';
import type { CatalogStore } from './catalog-ports';

export interface TransferController {
  /**
   * Transfer stock from one warehouse to another for a specific variant.
   *
   * @param store - The catalog store implementation
   * @param input - Transfer input parameters
   * @returns Promise resolving to transfer results
   */
  transferStock(
    store: CatalogStore,
    input: TransferStockInput
  ): Promise<TransferResult>;
}

// Export an instance of the controller for use in APIs
export const transferController: TransferController = {
  async transferStock(store, input) {
    return await transferStock(store, input);
  },
};

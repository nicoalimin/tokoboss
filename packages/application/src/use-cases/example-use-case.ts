import type { Repository } from '@tokoboss/domain';
import { Money, Quantity } from '@tokoboss/domain';
import { UseCase, Result, Success, Failure } from './base-use-case.js';

/**
 * Example item for demonstration purposes
 * In a real implementation, this would be a domain entity
 */
export interface Item {
  id: string;
  name: string;
  price: Money;
  quantity: Quantity;
}

/**
 * Request DTO for calculating total value
 */
export interface CalculateTotalValueRequest {
  itemId: string;
}

/**
 * Response DTO for total value calculation
 */
export interface CalculateTotalValueResponse {
  itemId: string;
  itemName: string;
  unitPrice: Money;
  quantity: Quantity;
  totalValue: Money;
}

/**
 * Example use case: Calculate total value of an item
 * Demonstrates Clean Architecture with ports and adapters
 */
export class CalculateTotalValueUseCase
  implements UseCase<CalculateTotalValueRequest, Result<CalculateTotalValueResponse, Error>>
{
  constructor(private readonly itemRepository: Repository<Item, string>) {}

  async execute(
    request: CalculateTotalValueRequest
  ): Promise<Result<CalculateTotalValueResponse, Error>> {
    try {
      // Fetch item from repository (port)
      const item = await this.itemRepository.findById(request.itemId);

      if (!item) {
        return Failure(new Error(`Item with id ${request.itemId} not found`));
      }

      // Business logic: calculate total value
      const totalValue = item.price.multiply(item.quantity.value);

      // Return result
      return Success({
        itemId: item.id,
        itemName: item.name,
        unitPrice: item.price,
        quantity: item.quantity,
        totalValue,
      });
    } catch (error) {
      return Failure(error instanceof Error ? error : new Error('Unknown error'));
    }
  }
}

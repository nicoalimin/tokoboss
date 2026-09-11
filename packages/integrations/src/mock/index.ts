/**
 * Mock implementations for testing
 */

import type { MarketplaceAdapter, PaymentAdapter, ShippingAdapter } from '../ports';

export class MockMarketplaceAdapter implements MarketplaceAdapter {
  async getOrders(_marketplaceId: string): Promise<unknown[]> {
    return [];
  }

  async syncInventory(_marketplaceId: string, _items: unknown[]): Promise<void> {
    // Mock implementation
  }
}

export class MockPaymentAdapter implements PaymentAdapter {
  async processPayment(_paymentRequest: unknown): Promise<unknown> {
    return { transactionId: 'mock-txn-123', status: 'success' };
  }

  async refundPayment(_transactionId: string): Promise<void> {
    // Mock implementation
  }
}

export class MockShippingAdapter implements ShippingAdapter {
  async getRates(_origin: string, _destination: string, _weight: number): Promise<unknown[]> {
    return [
      { provider: 'JNE', service: 'REG', cost: 15000 },
      { provider: 'JNE', service: 'YES', cost: 25000 },
    ];
  }

  async createShipment(_shipmentRequest: unknown): Promise<unknown> {
    return { trackingNumber: 'MOCK-123456' };
  }

  async trackShipment(_trackingNumber: string): Promise<unknown> {
    return { status: 'in_transit' };
  }
}

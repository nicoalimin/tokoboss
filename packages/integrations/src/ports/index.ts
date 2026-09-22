/**
 * Port definitions for external integrations
 * Infrastructure adapters implement these interfaces
 */

export interface MarketplaceAdapter {
  getOrders(marketplaceId: string): Promise<unknown[]>;
  syncInventory(marketplaceId: string, items: unknown[]): Promise<void>;
}

export interface PaymentAdapter {
  processPayment(paymentRequest: unknown): Promise<unknown>;
  refundPayment(transactionId: string): Promise<void>;
}

export interface ShippingAdapter {
  getRates(
    origin: string,
    destination: string,
    weight: number
  ): Promise<unknown[]>;
  createShipment(shipmentRequest: unknown): Promise<unknown>;
  trackShipment(trackingNumber: string): Promise<unknown>;
}

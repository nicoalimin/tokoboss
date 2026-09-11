/**
 * Stable error codes for API responses
 * These codes are part of the public contract and should not change
 */
export enum ErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Business logic errors
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION',
  INSUFFICIENT_INVENTORY = 'INSUFFICIENT_INVENTORY',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',

  // Integration errors
  MARKETPLACE_ERROR = 'MARKETPLACE_ERROR',
  PAYMENT_ERROR = 'PAYMENT_ERROR',
  SHIPPING_ERROR = 'SHIPPING_ERROR',
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  code: ErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Helper to create error response
 */
export function createErrorResponse(
  code: ErrorCode | string,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return { code, message, details };
}

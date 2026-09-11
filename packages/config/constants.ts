/**
 * Application-wide constants
 */

export const APP_NAME = 'TokoBoss';

export const APP_DESCRIPTION = 'Inventory-first ERP for Indonesian MSMEs';

export const SUPPORTED_CURRENCIES = ['IDR', 'USD'] as const;

export const DEFAULT_CURRENCY = 'IDR';

export const SUPPORTED_LANGUAGES = ['id', 'en'] as const;

export const DEFAULT_LANGUAGE = 'id';

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const API_VERSION = 'v1';

export const DATE_FORMAT = {
  SHORT: 'dd/MM/yyyy',
  LONG: 'dd MMMM yyyy',
  WITH_TIME: 'dd/MM/yyyy HH:mm',
} as const;

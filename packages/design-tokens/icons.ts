/**
 * Icon size tokens
 * These define standard sizes for icons across the system
 * Actual icon components should be implemented separately
 */

export const iconSizes = {
  xs: '12px',
  sm: '16px',
  base: '20px',
  md: '24px',
  lg: '32px',
  xl: '40px',
  '2xl': '48px',
  '3xl': '64px',
} as const;

/**
 * Common icon names (reference only)
 * Actual icon implementations should be in a separate UI package
 */
export const iconNames = [
  'home',
  'inventory',
  'orders',
  'analytics',
  'settings',
  'search',
  'add',
  'edit',
  'delete',
  'save',
  'cancel',
  'back',
  'forward',
  'menu',
  'close',
  'check',
  'warning',
  'error',
  'info',
] as const;

export type IconSize = keyof typeof iconSizes;
export type IconName = (typeof iconNames)[number];

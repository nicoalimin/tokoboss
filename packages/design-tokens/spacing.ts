/**
 * Spacing tokens - Consistent spacing scale
 * Based on 4px base unit
 */

export const spacing = {
  0: '0px',
  0.5: '2px', // 0.5 * 4
  1: '4px', // 1 * 4
  1.5: '6px', // 1.5 * 4
  2: '8px', // 2 * 4
  2.5: '10px', // 2.5 * 4
  3: '12px', // 3 * 4
  3.5: '14px', // 3.5 * 4
  4: '16px', // 4 * 4
  5: '20px', // 5 * 4
  6: '24px', // 6 * 4
  7: '28px', // 7 * 4
  8: '32px', // 8 * 4
  9: '36px', // 9 * 4
  10: '40px', // 10 * 4
  11: '44px', // 11 * 4
  12: '48px', // 12 * 4
  14: '56px', // 14 * 4
  16: '64px', // 16 * 4
  20: '80px', // 20 * 4
  24: '96px', // 24 * 4
  28: '112px', // 28 * 4
  32: '128px', // 32 * 4
  36: '144px', // 36 * 4
  40: '160px', // 40 * 4
  44: '176px', // 44 * 4
  48: '192px', // 48 * 4
  52: '208px', // 52 * 4
  56: '224px', // 56 * 4
  60: '240px', // 60 * 4
  64: '256px', // 64 * 4
  72: '288px', // 72 * 4
  80: '320px', // 80 * 4
  96: '384px', // 96 * 4
} as const;

/**
 * Border radius tokens
 */
export const borderRadius = {
  none: '0px',
  sm: '2px',
  base: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
} as const;

export type SpacingToken = typeof spacing;
export type BorderRadiusToken = typeof borderRadius;

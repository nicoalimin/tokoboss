/**
 * Color palette - Pastel colors for TokoBoss
 * Indonesian market-friendly, soft, and approachable
 */

export const colors = {
  // Primary pastel colors
  primary: {
    50: '#FFF5F7',
    100: '#FFE3E8',
    200: '#FFC7D4',
    300: '#FFA6BD',
    400: '#FF8BA8',
    500: '#FF7096', // Main primary
    600: '#E6658A',
    700: '#CC5A7E',
    800: '#B34F72',
    900: '#994466',
  },

  // Secondary pastel colors
  secondary: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    200: '#B9E6FE',
    300: '#7DD3FC',
    400: '#38BDF8',
    500: '#0EA5E9', // Main secondary
    600: '#0284C7',
    700: '#0369A1',
    800: '#075985',
    900: '#0C4A6E',
  },

  // Success - Soft green
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E', // Main success
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },

  // Warning - Soft yellow/orange
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B', // Main warning
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },

  // Error - Soft red/coral
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444', // Main error
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },

  // Neutral/Grays
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
  },

  // Semantic colors
  background: '#FFFFFF',
  foreground: '#171717',
  surface: '#FAFAFA',
  border: '#E5E5E5',

  // Text colors
  text: {
    primary: '#171717',
    secondary: '#525252',
    tertiary: '#A3A3A3',
    inverse: '#FFFFFF',
  },
} as const;

export type ColorToken = typeof colors;

import type { Config } from 'tailwindcss';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  zIndex,
} from '@tokoboss/design-tokens';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        secondary: colors.secondary,
        accent: colors.accent,
        neutral: colors.neutral,
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        info: colors.info,
      },
      fontFamily: {
        sans: typography.fontFamily.sans.split(', '),
        mono: typography.fontFamily.mono.split(', '),
      },
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      lineHeight: typography.lineHeight,
      spacing,
      borderRadius,
      boxShadow: shadows,
      zIndex: {
        base: String(zIndex.base),
        dropdown: String(zIndex.dropdown),
        sticky: String(zIndex.sticky),
        fixed: String(zIndex.fixed),
        modalBackdrop: String(zIndex.modalBackdrop),
        modal: String(zIndex.modal),
        popover: String(zIndex.popover),
        tooltip: String(zIndex.tooltip),
      },
    },
  },
  plugins: [],
};

export default config;

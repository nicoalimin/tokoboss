/**
 * Mobile theme mapped from shared design tokens (UTA-13).
 *
 * Source of truth stays in `@tokoboss/design-tokens` (pastel palette,
 * compact spacing, large touch targets, icon sizes per the Design
 * Contract). This module only converts web-oriented token strings
 * (`'12px'`, `'1.5rem'`) into React Native numbers — no local color or
 * size inventions. Screens must use these values so the pastel theme and
 * minimum 44×44 (iOS) / 48×48 (Android) touch targets hold everywhere.
 */

import { colors } from '@tokoboss/design-tokens/colors';
import { borderRadius, spacing } from '@tokoboss/design-tokens/spacing';
import { touchTargets } from '@tokoboss/design-tokens/touch-targets';
import { iconSizes } from '@tokoboss/design-tokens/icons';
import { typography } from '@tokoboss/design-tokens/typography';

function px(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`theme: expected a px token, got ${JSON.stringify(value)}`);
  }
  return parsed;
}

function rem(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `theme: expected a rem token, got ${JSON.stringify(value)}`
    );
  }
  return Math.round(parsed * 16);
}

export const theme = {
  colors: {
    primary: colors.primary[500],
    primarySoft: colors.primary[100],
    secondary: colors.secondary[500],
    secondarySoft: colors.secondary[100],
    success: colors.success[500],
    successSoft: colors.success[100],
    warning: colors.warning[500],
    warningSoft: colors.warning[100],
    error: colors.error[500],
    errorSoft: colors.error[100],
    background: colors.background,
    surface: colors.surface,
    border: colors.border,
    text: colors.text.primary,
    textSecondary: colors.text.secondary,
    textInverse: colors.text.inverse,
  },
  /** Compact spacing scale (4px base unit, RN numbers). */
  spacing: {
    xs: px(spacing[1]),
    sm: px(spacing[2]),
    md: px(spacing[3]),
    lg: px(spacing[4]),
    xl: px(spacing[6]),
    xxl: px(spacing[8]),
  },
  /**
   * Large touch targets: 44×44 iOS minimum, 48×48 Android minimum.
   * Primary actions use `button` (52) so small-screen + large-text
   * rendering never clips them.
   */
  touch: {
    minIos: px(touchTargets.minSize),
    minAndroid: px(touchTargets.minSizeAndroid),
    button: px(touchTargets.button.large),
    buttonBase: px(touchTargets.button.base),
    gap: px(touchTargets.spacing.comfortable),
  },
  icons: {
    sm: px(iconSizes.sm),
    md: px(iconSizes.md),
    lg: px(iconSizes.lg),
  },
  radius: {
    sm: px(borderRadius.sm),
    md: px(borderRadius.md),
    lg: px(borderRadius.lg),
    full: 9999,
  },
  type: {
    body: rem(typography.fontSize.base),
    caption: rem(typography.fontSize.sm),
    title: rem(typography.fontSize.xl),
    heading: rem(typography.fontSize['2xl']),
  },
} as const;

/** Minimum tappable height for the current platform. */
export function minTouchTarget(platform: 'ios' | 'android'): number {
  return platform === 'android' ? theme.touch.minAndroid : theme.touch.minIos;
}

/**
 * Guardrail for large-text mode: keep `maxFontSizeMultiplier` at 1.3 so
 * primary actions stay on one line; testIDs stay stable for smoke tests.
 */
export const maxFontSizeMultiplier = 1.3;

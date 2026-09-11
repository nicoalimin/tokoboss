/**
 * Touch target tokens
 * Minimum sizes for interactive elements (mobile-first)
 */

export const touchTargets = {
  // Minimum touch target size (44x44 iOS, 48x48 Android)
  minSize: '44px',
  minSizeAndroid: '48px',
  
  // Recommended sizes for different element types
  button: {
    small: '36px',
    base: '44px',
    large: '52px',
  },
  
  input: {
    height: '44px',
    minHeight: '40px',
  },
  
  checkbox: {
    size: '24px',
    touchArea: '44px', // Invisible touch area around checkbox
  },
  
  radio: {
    size: '24px',
    touchArea: '44px',
  },
  
  switch: {
    width: '52px',
    height: '32px',
    touchArea: '44px',
  },
  
  // Spacing between touch targets
  spacing: {
    minimum: '8px',
    comfortable: '12px',
  },
} as const;

export type TouchTargetToken = typeof touchTargets;

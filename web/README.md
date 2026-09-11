# TokoBoss Web

Next.js 15 App Router application for TokoBoss with Tailwind CSS wired to design tokens.

## Development

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Tailwind CSS + Design Tokens

This web app uses Tailwind CSS v3 configured to use the shared design tokens from `@tokoboss/design-tokens`.

### Using Design Tokens

All design tokens from `packages/design-tokens` are automatically available as Tailwind utility classes:

#### Colors

The pastel color palette is available with the following prefixes:

```tsx
// Primary colors (soft blue)
<div className="bg-primary-500 text-primary-50">...</div>

// Secondary colors (soft mint)
<div className="bg-secondary-500 text-white">...</div>

// Accent colors (soft coral)
<div className="bg-accent-400 border-accent-600">...</div>

// Neutral colors (grayscale)
<div className="bg-neutral-100 text-neutral-900">...</div>

// Semantic colors
<div className="text-success-600">Success message</div>
<div className="text-error-500">Error message</div>
<div className="text-warning-500">Warning message</div>
<div className="text-info-500">Info message</div>
```

#### Typography

Font families, sizes, weights, and line heights:

```tsx
// Font families
<p className="font-sans">System font</p>
<code className="font-mono">Monospace</code>

// Font sizes (xs, sm, base, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl)
<h1 className="text-5xl">Large heading</h1>
<p className="text-base">Body text</p>

// Font weights (thin, extralight, light, normal, medium, semibold, bold, extrabold, black)
<p className="font-semibold">Semi-bold text</p>

// Line heights (none, tight, snug, normal, relaxed, loose)
<p className="leading-relaxed">Relaxed line height</p>
```

#### Spacing

Consistent spacing scale (0-64):

```tsx
// Padding, margin, gap
<div className="p-4 m-8 space-y-6">
  <div className="px-6 py-3">Button</div>
</div>
```

#### Border Radius

```tsx
// Border radius (none, sm, base, md, lg, xl, 2xl, 3xl, full)
<div className="rounded-lg">Rounded corners</div>
<button className="rounded-full">Pill button</button>
```

#### Shadows

```tsx
// Box shadows (sm, base, md, lg, xl, 2xl, none)
<div className="shadow-md">Card with shadow</div>
```

#### Z-Index

```tsx
// Z-index layers (base, dropdown, sticky, fixed, modalBackdrop, modal, popover, tooltip)
<div className="z-modal">Modal content</div>
```

### Touch Targets

The design tokens include minimum touch target sizes for mobile accessibility. Use these values when creating interactive elements:

- Minimum: 44px (iOS standard)
- Recommended: 48px (Android standard)

For buttons, use padding and min-height classes to ensure adequate touch targets:

```tsx
// Adequate touch target
<button className="px-6 py-3 min-h-[44px]">
  Button with proper touch target
</button>
```

### Mobile Compatibility

The design tokens are shared between web (Tailwind CSS) and mobile (React Native StyleSheet). This ensures consistent design across platforms while keeping the mobile app free of web-specific Tailwind coupling.

To use design tokens in mobile:

```ts
import { colors, typography, spacing } from '@tokoboss/design-tokens';

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primary[50],
    padding: spacing[4],
  },
});
```

### Configuration

The Tailwind configuration is in `tailwind.config.ts` and maps all design tokens to Tailwind's theme. Any updates to `packages/design-tokens/index.ts` will automatically be reflected in Tailwind utilities.

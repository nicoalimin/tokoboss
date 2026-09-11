# Boundary Tests

This directory contains tests to enforce Clean Architecture layer boundaries.

## What it checks

- **Domain layer purity**: Ensures domain code doesn't import from frameworks (Next.js, Expo, React Native, Drizzle, Vercel, marketplace SDKs)
- **Dependency direction**: Validates that dependencies flow inward (infrastructure → application → domain)

## Running the tests

```bash
pnpm --filter @tokoboss/boundary-tests test
```

Or from the root:

```bash
pnpm test:boundaries
```

## Forbidden imports in domain layer

The domain layer must remain framework-agnostic. It cannot import from:

- `next` (Next.js)
- `react` / `react-native` (React/React Native)
- `expo` (Expo)
- `@vercel/*` (Vercel SDK)
- `drizzle-orm` (Drizzle ORM)
- `@tokopedia/*`, `@shopee/*`, `@bukalapak/*`, etc. (Marketplace SDKs)

## Why this matters

Clean Architecture requires that the domain layer contains pure business logic with no framework dependencies. This ensures:

1. **Testability**: Domain logic can be tested without framework setup
2. **Portability**: Business logic can be reused across different platforms
3. **Maintainability**: Framework changes don't affect business rules
4. **Independence**: Core logic isn't coupled to external libraries

# Example Use Case Test

This directory contains an example that demonstrates the Clean Architecture implementation with ports and adapters pattern.

## What it demonstrates

1. **Domain Layer**: Pure business logic
   - `Money` value object (currency handling)
   - `Quantity` value object (quantity with units)
   - No framework dependencies

2. **Application Layer**: Use case orchestration
   - `CalculateTotalValueUseCase` (business workflow)
   - Depends on repository port (interface)
   - Returns structured results

3. **Infrastructure Layer**: Adapter implementations
   - `InMemoryRepository` (implements repository port)
   - Can be swapped with real database implementation
   - No changes needed in use case

## Running the example

```bash
pnpm --filter @tokoboss/example-use-case-test test
```

Or from the root:

```bash
pnpm test:example
```

Or install dependencies first:

```bash
pnpm install
pnpm test:example
```

## Expected output

The test should:

- ✅ Create a test item with price and quantity
- ✅ Execute the use case with in-memory repository
- ✅ Calculate total value correctly
- ✅ Demonstrate dependency inversion principle

## Key benefits demonstrated

- **Testability**: Use cases can be tested with in-memory adapters
- **Flexibility**: Can swap implementations without changing business logic
- **Maintainability**: Clear separation of concerns
- **Independence**: Domain logic doesn't depend on infrastructure

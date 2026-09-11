# Packages

Shared packages for the TokoBoss monorepo following RFC 01 architecture.

## Structure

- `domain/` - Core domain models and business logic (DDD entities, value objects, domain services)
- `application/` - Application services and use cases (commands, queries, DTOs)
- `contracts/` - Shared TypeScript types and interfaces
- `database/` - Database access layer (repositories, query builders)
- `integrations/` - Third-party integrations (marketplaces, payment providers, logistics)
- `auth/` - Authentication and authorization utilities
- `design-tokens/` - Design system tokens and theming
- `config/` - Shared configuration and environment variables

All packages are currently stubs. See UTA-8 for full implementation.

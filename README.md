# TokoBoss

TokoBoss is an inventory-first ERP for Indonesian MSMEs and SMEs selling through marketplaces and other channels. Every workflow should be understandable without ERP training: use familiar Indonesian terms, show the next action clearly, and keep advanced controls out of the default path.

## Monorepo Structure

This is a TypeScript monorepo managed with pnpm workspaces, following the architecture defined in RFC 01.

```
tokoboss/
├── web/              # Next.js 15 App Router web application
├── mobile/           # Expo Router mobile application (React Native)
├── infra/            # Infrastructure configuration
│   ├── vercel/       # Vercel deployment config (stub)
│   ├── neon/         # Neon Postgres setup (stub)
│   ├── drizzle/      # Drizzle ORM migrations (stub)
│   ├── observability/# Logging & monitoring (stub)
│   └── scripts/      # Deployment scripts (stub)
├── packages/         # Shared packages (RFC 01 architecture)
│   ├── domain/       # Domain models & business logic (stub)
│   ├── application/  # Application services & use cases (stub)
│   ├── contracts/    # Shared TypeScript types (stub)
│   ├── database/     # Database access layer (stub)
│   ├── integrations/ # Third-party integrations (stub)
│   ├── auth/         # Auth utilities (stub)
│   ├── design-tokens/# Design system tokens (stub)
│   └── config/       # Shared configuration (stub)
└── ...               # Root configuration files
```

## Getting Started

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 10.0.0

### Installation

From a clean checkout, install all dependencies:

```bash
pnpm install
```

This will install dependencies for all workspaces (web, mobile, and packages).

## Development

### Web Application

Start the Next.js development server:

```bash
pnpm dev
```

The web application will be available at http://localhost:3000

### Mobile Application

Start the Expo development server:

```bash
cd mobile
pnpm start
```

Follow the Expo CLI prompts to open the app on iOS, Android, or web.

Note: Mobile is currently a stub placeholder for future development.

## Available Scripts

Run from the root directory:

- `pnpm dev` - Start web development server
- `pnpm build` - Build all workspaces
- `pnpm lint` - Lint all workspaces
- `pnpm typecheck` - Type-check all workspaces
- `pnpm test` - Run tests across all workspaces
- `pnpm format` - Format all code with Prettier
- `pnpm format:check` - Check code formatting

## Workspace Ownership

### Primary Workspaces

- **web/** - Web frontend team
- **mobile/** - Mobile team (future)
- **infra/** - DevOps/Platform team

### Shared Packages (packages/)

- **domain/** - Backend team (business logic)
- **application/** - Backend team (use cases)
- **contracts/** - Shared across teams (types & interfaces)
- **database/** - Backend team (data access)
- **integrations/** - Backend team (3rd party APIs)
- **auth/** - Backend team (authentication)
- **design-tokens/** - Design team
- **config/** - Platform team

## Technology Stack

- **Language**: TypeScript 5.7+
- **Package Manager**: pnpm 10+
- **Web Framework**: Next.js 15 (App Router)
- **Mobile Framework**: Expo Router (React Native)
- **Formatting**: Prettier
- **Type Checking**: TypeScript strict mode

## Next Steps

Most packages are currently stubs. See Linear issue UTA-8 for full package implementation.

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `pnpm lint` and `pnpm typecheck` pass
4. Open a pull request

## License

Proprietary - All rights reserved

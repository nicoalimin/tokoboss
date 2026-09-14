# Infrastructure

Infrastructure configuration and deployment scripts for TokoBoss.

## Structure

- `vercel/` - Vercel deployment configuration (see `PREVIEW_WIRING.md` for per-PR DATABASE_URL)
- `neon/` - Neon database setup, preview-branch lifecycle (`preview-*.mjs`) and migrations
- `drizzle/` - Drizzle ORM schema and migrations
- `observability/` - Logging, monitoring, and tracing configuration
- `scripts/` - Utility scripts for deployment and maintenance

All directories are currently stubs and will be populated as needed.

# Transaction integration test (UTA-10)

Exercises the `DatabasePort` (`@tokoboss/domain`) through a real adapter
implementation (`@tokoboss/database`):

- Commit persists all writes atomically.
- Errors roll back all writes (no partial state).
- Foreign-key and uniqueness rules are enforced inside transactions.
- Synthetic seeds are deterministic and production-safe.

Runs entirely in-memory — no credentials, no network. When `DATABASE_URL`
points at a non-production Neon branch, the same scenarios also run against
`DrizzleDatabase` (live); otherwise the live section is skipped.

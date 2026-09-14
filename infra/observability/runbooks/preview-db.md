# Runbook: preview DB (UTA-11 automation)

Ownership: Neon preview branching + Vercel `DATABASE_URL` wiring is Done
(UTA-11, merge `1e2e466`). This scaffold does not change it.

Triage:

1. PR preview missing DB → check the `preview-db` workflow run → `preview setup`
   job logs (hosts only, never secrets).
2. Reconcile stranded branches: dispatch `preview-db` with
   `mode=reconcile-dry-run`, then `mode=reconcile` if the list is correct.
3. Suspect credential leak: rotate via operator (Production credentials are
   never in Preview scope — see `infra/vercel/PREVIEW_WIRING.md`).

Full procedure: [`infra/neon/README.md`](../../neon/README.md).

# 0003: Eval runner is a CLI, not a UI

## Context
Eval runs are long, cost real money and must be reproducible. A button in the app invites accidental spend and serverless timeouts.

## Decision
Evals run via `pnpm eval` (`scripts/eval.ts`). Each invocation writes `eval_runs`/`eval_results` rows and a `reports/<timestamp>.json`. The UI may display stored results but never starts a run.

## Consequences
- Runs are scriptable, loggable and CI-friendly later.
- Spend is always an explicit command with explicit `--models`.
- Less demo-friendly; the README carries a results table instead.

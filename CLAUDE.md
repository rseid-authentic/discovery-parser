# discovery-parser

AI parser for antitrust-discovery documents (emails, memos, financial statements, scans). v0: upload PDF -> Vercel Blob (CDN) -> text-layer detect -> OpenRouter model (text or native PDF) -> Zod "envelope" with per-field provenance -> Neon Postgres -> viewer page, plus an eval CLI scoring per-field accuracy, omitted/invented rates, tokens, cost and latency per model against hand-labelled ground truth. Solo resume project. `SPEC.md` is authoritative on scope; don't start v1 work before the v0 definition-of-done is met.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Format | `pnpm format` / `pnpm format:check` |
| Unit tests | `pnpm test` |
| Eval | `pnpm eval --models <ids> [--mode auto\|text\|pdf] [--engine ...] [--docs 'glob'] [--name n]` |
| Draft labels | `pnpm eval:bootstrap` |
| Upload samples to Blob | `pnpm samples:upload` |
| Drizzle migrations | `pnpm db:generate` / `pnpm db:push` / `pnpm db:studio` |

## Directory map

- `src/app/` App Router pages, `api/upload` route, `documents/[id]` viewer and `runs`
- `src/lib/schema/envelope.ts` Envelope + ground-truth Zod schemas (Field wrapper)
- `src/lib/parse/` text-layer detection, routing, prompts, `extractEnvelope`
- `src/lib/eval/` per-field scorers, scoring, report
- `src/lib/{env,models,openrouter}.ts` lazy env, model registry/prices, provider
- `src/lib/storage/blob.ts` Blob client; `src/db/` Drizzle schema + lazy client
- `scripts/` eval, bootstrap-labels, upload-samples (+ `scripts/lib/`)
- `data/samples/` public PDFs; `data/ground-truth/` labels; `docs/adr/` decisions

## Stack

- pnpm only. Next 16 App Router: read `node_modules/next/dist/docs/` before writing App Router code; it differs from training data (see `AGENTS.md`).
- TypeScript strict, Tailwind 4, vitest.
- Vercel AI SDK (`ai`) + `@openrouter/ai-sdk-provider`, Zod 4, Drizzle + Neon, unpdf.

## Conventions

- Read env only via `src/lib/env.ts`; clients are lazy so `pnpm build` works with no env.
- No agent frameworks. No generic Pipeline/Stage abstraction; plain functions.
- The eval runner is a CLI, not a UI button (ADR 0003).
- Commit messages: `scope: what changed`.
- Mark unverified external facts (model ids, prices, plugin shapes) with `// VERIFY`.

## Data

Samples are public court exhibits. Never commit private docs; `data/samples/private/` is gitignored. Ground truth is hand-labelled by the owner; `.draft.json` files are never scored.

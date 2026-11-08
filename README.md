# discovery-parser

AI parser for antitrust-discovery documents. Upload a PDF, store it on Vercel Blob behind a CDN, detect the text layer, extract a Zod-validated "envelope" (every field with confidence, page and source text) via OpenRouter, save to Neon Postgres, and view it. An eval CLI scores models per field against hand-labelled ground truth and reports accuracy, omitted/invented rates, tokens, cost and latency.

Status: v0 in progress. Scope, plan and definition-of-done are in [SPEC.md](SPEC.md); decisions in [docs/adr/](docs/adr/).

## Quickstart

Requires Node >= 22 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # fill in OpenRouter, Neon, Blob values
pnpm db:push                 # create tables in Neon
pnpm dev                     # http://localhost:3000
```

`pnpm build`, `pnpm typecheck`, `pnpm lint` and `pnpm test` work with no env file.

## Eval

1. Put public sample PDFs in `data/samples/` (private ones go in the gitignored `data/samples/private/`).
2. `pnpm eval:bootstrap` writes `data/ground-truth/<name>.draft.json`; hand-correct and save as `<name>.json` (see `data/ground-truth/README.md`).
3. `pnpm samples:upload` pushes samples to Blob.
4. Run:

```bash
pnpm eval --models google/gemini-2.5-flash-lite,openai/gpt-5-mini --name baseline
pnpm eval --models qwen/qwen3-vl-8b-instruct --mode pdf --engine mistral-ocr --docs 'UPX*.pdf'
```

Reports land in `reports/` (gitignored) and in the `eval_runs`/`eval_results` tables.

## Scripts

`dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `eval`, `eval:bootstrap`, `samples:upload`, `db:generate`, `db:push`, `db:studio`.

## Environment

See `.env.example`. OpenRouter vars are needed for parsing/eval, `DATABASE_URL` for anything touching the DB, and `BLOB_READ_WRITE_TOKEN` for uploads and `samples:upload`. Browser uploads are limited to 4 MB so they fit within Vercel's function request limit; the sample CLI uploads directly to Blob.

## Results

None yet. Vendor OCR benchmark numbers disagree by 40+ points across evaluators; this README will report only our own measured numbers.

## Data

Samples are public court exhibits (e.g. DOJ v. Google trial exhibits). Never commit private documents.

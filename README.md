# discovery-parser

AI parser for antitrust-discovery documents. Extract text from PDFs for search and downstream analysis, with a Zod-validated metadata envelope and document-specific suggestions. Results are stored in Neon and viewed alongside the original public Vercel Blob PDF. An eval CLI scores core fields against hand-labelled ground truth; OCR/text quality requires separate evaluation.

Status: v0 in progress. Scope, plan and definition-of-done are in [SPEC.md](SPEC.md); decisions in [docs/adr/](docs/adr/).

## Quickstart

Requires Node >= 22 and pnpm.

```bash
pnpm install
cp .env.example .env.local   # fill in OpenRouter, Neon, Blob and upload token
pnpm db:push                 # create tables in Neon
pnpm dev                     # http://localhost:3000
```

`pnpm build`, `pnpm typecheck`, `pnpm lint` and `pnpm test` work with no env file.

Uploads are disabled until `UPLOAD_ACCESS_TOKEN` is set to a random secret of at least 32 characters in the server environment. Enter the same token in the upload form; never commit it or expose it as a `NEXT_PUBLIC_` variable. For deployment, configure it separately in the relevant Vercel environments. Public browsing remains available. The token is a simple demo access boundary, not a user account system.

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

## Review labels

Open a parsed document and select **Review** beside **Extraction**. Check and correct each field against the PDF, then mark it reviewed. Source details can be expanded when needed. The field list is still a draft; a privilege legend is only a signal, not a legal determination.

Progress is saved in the current browser, not on the server or across devices. Once every field is reviewed, download the label and place it in `data/ground-truth/`. The matching PDF must be in `data/samples/` with the same base name for `pnpm eval` to pick it up. The downloaded label contains human-reviewed values, not the model's confidence scores.

## Scripts

`dev`, `build`, `start`, `lint`, `format`, `format:check`, `typecheck`, `test`, `eval`, `eval:bootstrap`, `samples:upload`, `db:generate`, `db:push`, `db:studio`.

## Environment

See `.env.example`. OpenRouter vars are needed for parsing/eval, `DATABASE_URL` for anything touching the DB, and `BLOB_READ_WRITE_TOKEN` for uploads and `samples:upload`. Browser uploads are limited to 4 MB and 25 pages; the sample CLI uploads directly to Blob. Keep an account-level OpenRouter spend limit as a separate backstop: the upload token and per-request cap are not an aggregate spend limit.

**Public demo:** uploaded documents, extracted text, metadata, and JSON exports are publicly accessible. Documents are sent to external processing providers. Upload only public or explicitly approved samples; don't use sensitive discovery material. The previous deployment is unchanged until these local changes are deployed.

## Results

None yet. Vendor OCR benchmark numbers disagree by 40+ points across evaluators; this README will report only our own measured numbers.

## Data

Samples are public court exhibits (e.g. DOJ v. Google trial exhibits). Never commit private documents.

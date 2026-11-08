# SPEC

## Goal & resume framing

Build a small, honest document parser for antitrust-discovery material that turns messy PDFs into a typed "envelope" where every field carries provenance (confidence, page, source text). The point is not another OCR demo: it is a measured system with an eval harness, per-field scorers, and cost/latency numbers per model. It demonstrates structured LLM extraction, CDN/object-storage fundamentals, and eval discipline on a domain (e-discovery) with real stakes. README reports our own numbers and cites vendor benchmarks only with caveats.

## Non-goals

- Not a review platform, no user accounts, no multi-tenancy.
- No agent frameworks, no generic Pipeline/Stage abstraction.
- No server-side PDF rendering in v0 (ADR 0002).
- No fine-tuning, no self-hosted OCR in v0.
- No legal conclusions: privilege flags are signals, never determinations.

## v0 scope and definition-of-done

Upload PDF -> Vercel Blob -> text-layer detect -> route -> OpenRouter -> Zod envelope -> Neon -> viewer; eval CLI over ~25 labelled docs.

- [ ] `pnpm typecheck`, `lint`, `test`, `build` pass with no `.env.local`
- [ ] Upload route stores PDF in Blob under a content-hashed key and records the `documents` row
- [ ] Parse produces a schema-valid envelope or a recorded `schema_violation` run
- [ ] Viewer page shows envelope fields with confidence/page/source_text and the CDN-hosted PDF
- [ ] Runs page lists every `extraction_runs` row with model, mode, tokens, cost, latency
- [ ] ~25 samples in `data/samples/`, hand-corrected labels in `data/ground-truth/`
- [ ] Owner has finalized the envelope field list and critical fields
- [ ] `pnpm eval` runs >= 3 models, writes `reports/*.json` and `eval_results` rows
- [ ] README has a results table from a real run and honest caveats
- [ ] Total spend within budget

## v1

BullMQ + Redis worker triggered on ingest (replaces the synchronous call in `runRoute`). Deterministic model cascade: each tier is its own `extraction_runs` row; escalate per Routing rules; human-review queue in Postgres. Report cost/page per tier.

## v2

Doc-type sub-schemas (email, financial statement, memo), Concordance/DAT export using FTC load-file vocabulary (BEGBATES, ENDBATES, PARENTID...), pdf.js bbox highlighting (adds `bbox` to Field), privilege flagging, doc-type confusion matrix and page-hit/IoU metrics.

## Architecture

```
browser --PDF--> /api/upload --sha256--> Blob (docs/<sha256>.pdf) --> CDN
                     |                                              ^
                     v                                              |
              documents row (Neon)                     viewer <-----+
                     |
          analyzeTextLayer (unpdf)
             |                 |
        text layer          scan / forced pdf
             v                 v
     text model (text)   vision model (file input)
             \                 /
          extractEnvelope: Zod validate + <=1 repair
                     v
        extraction_runs (output, tokens, cost, latency)

scripts/eval.ts: samples + ground-truth -> same route -> eval_runs / eval_results -> reports/
```

## Data model

Defined in `src/db/schema.ts`.

- `documents`: filename, storage_key (`docs/<sha256>.pdf`), public_url, mime, bytes, unique sha256, page_count, has_text_layer, status (queued/parsing/parsed/failed).
- `extraction_runs`: document_id, model, input_mode (text/pdf), pdf_engine, prompt_version, output (jsonb), schema_valid, error, input/output tokens, cost_usd, latency_ms.
- `ground_truth`: document_id (pk), envelope (jsonb), labeled_by, notes.
- `eval_runs`: name, config (jsonb).
- `eval_results`: eval_run_id, extraction_run_id, field, expected, actual, scorer, score, status (correct/wrong/omitted/invented/schema_violation).

## Envelope schema

Source: `src/lib/schema/envelope.ts`. Every scalar is `Field<T>` = `{value|null, confidence, page, source_text}`; no optional keys (strict JSON-schema modes reject them).

Fields: `doc_type`, `title_or_subject`, `doc_date` (YYYY-MM-DD), `author_from`, `recipients_to[]`, `cc[]`, `organizations[]`, `people[]`, `bates_begin`, `bates_end`, `page_count`, `has_privilege_legend`, `has_redactions`, `language`, plus unwrapped `summary` and `overall_confidence`.

Field list is a draft — owner finalizes before labelling.

## Eval methodology

- Per-field scorers (`src/lib/eval/scorers.ts`): normalized dates, exact Bates (case and leading zeros preserved), enum check for doc_type, normalized names, set comparison for list fields.
- Statuses per field: `correct`, `wrong`, `omitted` (truth has value, model null), `invented` (truth null, model has value), `schema_violation` (no valid envelope).
- Document pass gate: all critical fields correct. Critical set is owner-defined.
- Each run records tokens, cost (OpenRouter-reported `usage.cost`, list-price fallback) and latency; reports aggregate per model.
- `summary` is unscored in v0 (LLM-judge is a v2 option).
- Docs without non-draft ground truth are skipped.

## Routing rules

- v0: usable text layer -> text model on extracted text; no text layer (scan) -> vision/PDF model with the file attached.
- v1 escalation triggers: schema invalid after bounded repair; any critical-field confidence below threshold; cross-check failure (e.g. `page_count` != unpdf page count).
- Thresholds are chosen from eval data, not guessed.

## CDN learning goals

- Content-hashed keys (`docs/<sha256>.pdf`) so objects are immutable.
- Configure a one-year cache max age for content-hashed blobs.
- Inspect Vercel Blob response and cache headers with repeated requests and record observed behavior in the README.
- Signed URLs for private documents: later, not v0.

## Budget

$20-50 total. Rough plan: <= $5 for development calls, <= $15 for eval sweeps (25 docs x 3-5 models, cheap tiers), remainder reserve for one frontier-model comparison. Neon and Vercel on free tiers. Prices in `src/lib/models.ts` need re-verifying.

## 2-week plan (6 sittings)

1. Env + accounts (OpenRouter, Neon, Vercel Blob), `db:push`, upload route, CDN headers check.
2. Collect ~25 public samples, `samples:upload`, finalize envelope field list and critical fields.
3. Run `eval:bootstrap`, hand-correct labels into `<name>.json`.
4. First `pnpm eval` sweep, fix scorers/prompt, viewer + runs pages.
5. Model sweep (text vs pdf mode, engines), cost/latency tables.
6. README results, caveats, ADR touch-ups, definition-of-done pass.

## STOP rules

- Stop and re-plan if cumulative spend passes $30 before sitting 5.
- Stop adding envelope fields once labelling starts; changes require relabelling.
- Do not start v1 before every v0 checkbox is ticked.
- Do not commit private or non-public documents; stop and purge if it happens.
- If a sitting overruns by 2x, cut scope (fewer docs/models), not quality of labels.

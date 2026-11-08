# Discovery Parser — v0 Task Plan

## Goal
Ship a public Vercel URL where a PDF from an antitrust-discovery production (email, memo, financial statement, scan) is parsed by an LLM into a Zod "envelope" with per-field provenance, stored in Postgres, and shown beside the original (served from Vercel Blob via CDN). Ship an eval CLI that scores N models against 25 hand-labelled docs and reports per-field accuracy, omitted/invented rates, cost and latency. The eval table in the README is the resume artifact.

## Context
- Solo project, ~2 weeks, $20–50 budget. `SPEC.md` is authoritative on scope.
- Stack: Next 16 App Router, pnpm, TS strict, AI SDK + `@openrouter/ai-sdk-provider`, Zod 4, Drizzle + Neon, Vercel Blob, unpdf, vitest.
- Scaffold and real-service setup are verified as detailed below; full v0 eval and visual browser checks remain.
- Docs are heterogeneous, so one *envelope* schema for all types in v0; per-type sub-schemas are v2.
- No server-side PDF rendering in v0: OpenRouter accepts PDFs directly (ADR 0002); viewer embeds the PDF from Blob.
- Queue/worker and model cascade are v1. v0 parses synchronously in the upload route.
- Use only public or explicitly approved synthetic samples; the user's ZIP remains unclassified and excluded from Git and deployment.
- Owner owns judgment: final field list, critical fields, labelling, thresholds, interpreting results.

---

## Phase 0: Infra
- [x] `pnpm install` + `typecheck && lint && test && build` on the Mac
- [x] Git initialized, scaffold committed and pushed to private `rseid-authentic/discovery-parser`
- [x] Neon project → `DATABASE_URL` in `.env.local` → `pnpm db:push`; confirmed 5 tables
- [x] Public Vercel Blob store connected; write, public GET, and repeat-upload reuse verified
- [ ] Observe and document a Blob CDN cache HIT; two initial requests both reported MISS
- [x] OpenRouter structured-output text and native-PDF calls succeeded with usage and reported cost using GPT-6 Luna under account ZDR settings
- [ ] Re-verify remaining model registry prices and availability before eval sweeps; provider routing and prices can change
- [x] Vercel linked, required env vars set for Production and Preview, GitHub connected, production deployed
- [x] Upload route has `maxDuration = 300`; browser uploads limited to 4 MB by the server-upload approach
- [x] Commit `infra: neon + vercel blob wired; first doc parses end to end`

## Phase 1: Samples, schema, ground truth (owner-heavy)
- [ ] Pick the 25 sample PDFs; aim for a mix: ~8 emails, ~5 memos/letters, ~5 financial/accounting, ~4 decks/reports, ~3 very poor scans. Record source URL per doc in `data/samples/SOURCES.md`
- [ ] Finalize envelope field list in `src/lib/schema/envelope.ts` (owner decision); update `SPEC.md` + `data/ground-truth/README.md` if it changes
- [ ] Pick 3–4 **critical fields** for the document pass gate (likely `doc_type`, `doc_date`, `author_from`, `bates_begin`); encode in `score-envelope.ts`
- [ ] `pnpm samples:upload` → 25 rows in `documents`, files in Blob
- [ ] `pnpm eval:bootstrap` → `.draft.json` per doc from a frontier model
- [ ] Hand-correct each draft → `data/ground-truth/<basename>.json` (budget 3–4 focused hours; fix labels as you go)
- [ ] Commit `data: 25 samples + ground truth`

## Phase 2: End-to-end parse in the app
- [x] Local upload route → Blob → `documents` row → text-layer detect → extraction → `extraction_runs` row → status `parsed` for one public DOJ exhibit
- [ ] Visually verify `/documents/[id]` shows fields with confidence + page beside the embedded PDF from the Blob URL (server-rendered HTML checked; browser host unavailable)
- [ ] `/documents/[id]/runs` lists every extraction run (model, mode, tokens, cost, latency, schema_valid)
- [ ] Failure path: schema-invalid after one repair retry → status `failed`, error stored, visible in UI
- [ ] Observe Blob CDN cache behavior on repeated loads in the browser
- [ ] Deploy; smoke test on the Vercel URL with 2–3 docs
- [ ] Commit `app: upload → parse → viewer end to end`

## Phase 3: Eval runs
- [ ] `pnpm eval --models <cheap text model> --mode text --name baseline-text` on text-layer docs
- [ ] `pnpm eval --models <cheap vision model> --mode pdf --engine native --name baseline-pdf` on scans
- [ ] Full matrix: 3–5 models × `--mode auto`; record `reports/<timestamp>.json`
- [ ] Engine comparison on scans: `--engine native` vs `mistral-ocr` vs `pdf-text` for one model
- [ ] Sanity-check scorers against 3 docs by hand (dates, Bates, recipients F1)
- [ ] Interpret results (owner): which fields fail, omitted vs invented, where cheap ≈ frontier
- [ ] Commit `eval: baseline matrix across N models`

## Phase 4: Results, README, talk track
- [ ] README "Results" table: per model → field accuracy, doc pass rate, invented rate, $/doc, p50 latency
- [ ] README "What surprised me" (owner-written)
- [ ] README architecture diagram (export the Excalidraw) + link to `SPEC.md`, ADRs, research brief
- [ ] Caveats section: 25 docs is small; vendor OCR claims disagree by 40+ pts; benchmark contamination
- [ ] Talk track: 2-minute version + 5 likely follow-up questions (routing, cascade, CDN headers, eval design, cost)
- [ ] Tag `v0`

**v0 definition of done:** public URL parses an uploaded PDF end to end; 25 labelled docs; eval matrix across ≥3 models with cost; README results table + talk track.

---

## Phase 5 (v1): Queue + worker + cascade
- [ ] Redis (Redis Cloud free 30 MB, or local Docker in dev) + BullMQ; `queue` package or `src/lib/queue`
- [ ] Upload route enqueues `parse-document` job and returns immediately; status `queued`
- [ ] `worker/` Node process: consumes job → runs the existing parse path → updates DB; retries with backoff, dead-letter queue, concurrency setting
- [ ] UI polls status (or SSE) until `parsed`/`failed`
- [ ] Deterministic cascade in `src/lib/parse/route.ts`: cheap model → escalate on (a) schema invalid after repair, (b) any critical field confidence < threshold (owner picks), (c) cross-check failure; log tier per run
- [ ] Eval: add `--cascade` and report cost/doc + accuracy for cascade vs each single model
- [ ] Deploy worker to Railway/Fly (~$5/mo) for the demo; document local-worker option
- [ ] ADR 0004 queue, ADR 0005 cascade rules

## Phase 6 (v1): Eval expansion with public labelled datasets
- [ ] `data/benchmarks/<name>/` + adapter per dataset → ground-truth JSON; score only labelled fields
- [ ] `pnpm eval --dataset tobacco3482` → doc-type confusion matrix at scale (map 10/16 classes to the `doc_type` enum)
- [ ] Optional: Kleister-NDA adapter (parties, effective date, jurisdiction, term) as a second schema trial
- [ ] README: contrast benchmark numbers vs the unseen 25 (contamination caveat)

## Phase 7 (v2): Depth
- [ ] Doc-type sub-schemas (email headers, financial line items, memo re/distribution) behind the envelope
- [ ] Concordance/DAT load-file export using FTC field names (BEGBATES, ENDBATES, FROM, TO, CC, DATESENT, SUBJECT, PARENTID…)
- [ ] pdf.js viewer with bbox highlighting (click field → highlight source)
- [ ] Privilege-legend / attorney-name flagging with rationale
- [ ] Private Blob access + cache invalidation story

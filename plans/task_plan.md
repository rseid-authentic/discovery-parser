# Discovery Parser — v0 Task Plan

## Goal
Make heterogeneous discovery PDFs useful for search and downstream agents: extract the document's text, preserve its relationship to the original, and provide a small core metadata envelope and optional document-specific details. Focus on difficult scans and honest uncertainty, with a lightweight evaluation loop. A downstream analyzer/ontology is explicitly out of scope. This is a demo, not a production legal-review system.

## Current direction: text first, measurable quality, human fallback

### Intended output
- Preserve the original document and keep each text candidate's provenance: source (existing PDF text, OCR, or vision transcription), requested route/model, run/version, and page reference **when actually available**. Never present a guessed page, engine, or transcription as verified.
- Make text available in the viewer and a machine-readable export. The core envelope (document type, title, people, dates, Bates, page count, etc.) and a small set of document-specific details support the text; they do not replace it. No fixed receipt schema, downstream legal analysis, or ontology is being finalized now.
- A text layer can be stale or wrong, and a mixed PDF can contain text on some pages and image-only content on others. Text-layer presence is a routing signal, not a quality guarantee. Preserve original, source text, alternative candidates and corrections rather than overwriting one with another; distinguish missing/unavailable from confirmed absence.
- Show uncertainty and provenance. For ambiguous dates, retain the printed wording and do not silently guess a normalized date. AI confidence and a citation are signals, not proof.

### Human-review bookmark (proposed, not implemented)
- Provide a simple way to mark a **page when page-level evidence exists, otherwise the document** as needing human review, with a reason and link back to the original. Preserve the candidate text and original; a reviewer can record a decision/correction without overwriting the raw output.
- Possible reasons to investigate: missing or unreadable text, sparse/garbled text, handwriting, rotation, difficult layout or tables, conflicting sources, an ambiguous consequential value, or explicit user judgment. A low-confidence flag alone cannot catch text that was omitted altogether.
- Do not assume we can reliably detect every hard page; allow manual bookmarks and treat automated signals as candidates until calibrated. A human-review bookmark is not a legal privilege or responsiveness determination, a pass/fail judgment, or an automatic vision-model escalation. UI/storage details and whether to auto-flag any signals remain open.
- Keep the handoff small: reason, unresolved/resolved state, and document plus run/candidate and page when known. An unresolved flag means the content needs attention, not that it is safe to skip; resolving one flag does not certify the whole transcript. Treat source document text as untrusted content, not instructions for a downstream agent.

### Focused v0 reliability: merge with code-review findings
- [x] **Public upload boundary (local):** Fail closed without a server-side token; require it before Blob/model operations, explain public/provider exposure, and cap requests at 4 MB/25 pages. Local tests cover authorization and limits, including duplicate uploads. This is not an aggregate spend limit: retain the account-level OpenRouter cap, configure the secret before using uploads, and separately deploy/verify the change; the existing production endpoint is unchanged.
- [x] **Mixed PDFs (local):** Auto mode routes the whole PDF to OCR/PDF when any page lacks usable text, retaining an existing mixed text layer separately on schema-valid runs and warning completeness is not guaranteed. Local mocked routing tests cover text-only, scans, mixed, blank pages, ordering and overrides. Blank pages can trigger OCR. This doesn't detect corrupt inherited OCR, establish page completeness or cover every omission; the OCR path still needs live verification.
- [x] **Evaluation honesty (local):** Failed extractions receive no absent-field credit or document pass; successful null/null matches remain valid. Unknown/partial costs are unknown rather than zero and are not ranked as cheaper than measured cost. Local tests cover zero, nonzero, mixed unknown and failure cases. A text-quality benchmark remains separate.
- [ ] **Run visibility and retry (partial):** Viewer/export select the same identified success after a newer failure; a pinned run ID supports consistent exports and tests cover selection. Duplicates do not silently retry. Explicit failed/missing-file recovery, concurrent-upload behavior and stale jobs remain unimplemented; no v1 queue was added. No live/deployed verification yet.
- [x] **Text on failure (local):** If upload model processing throws after text extraction, the failed run retains the available text layer and page metadata; local mock tests cover this path. Other failures before extraction/metadata availability can still leave text unavailable.
- [ ] **Verification boundary:** Local fixtures/mocks, then typecheck, lint, tests and build. Clearly separate those checks from a live OCR/deployment result. No paid calls, schema changes to live services, or deployment as part of this pass unless explicitly requested.

### Small, bounded next steps
1. [ ] Implement the focused, local-only v0 fixes above as appropriate; preserve the uncommitted work and do not introduce the planned v1 queue or a new eval framework in this pass.
2. [ ] With separate authorization for the paid call, run one controlled, low-cost live OCR check on a reusable sample. Verify provider/privacy handling, returned text and page metadata, cost and failure behavior; don't publish documents with unconfirmed reuse rights.
3. [ ] Assemble roughly 5–10 diverse pages including clean text, scans, rotation, a table, handwriting/mixed-page or bad inherited text if available. Include easy as well as hard cases. Inventory already-public samples and their known/unknown reuse terms without silently deleting anything.
4. [ ] Compare the original page with existing text, OCR, and an explicitly requested vision **transcription** where useful. Use a tiny local script or files with source identity, page when known, route, result/failure, and cost; no comparison dashboard. The previous native-vision pilot extracted fields/summaries, not full text.
5. [ ] Choose a few search terms/snippets independently against the page, then record omissions, names, dates, amounts, negations, reading order and table errors, including failed/blank outputs. Distinguish provisional AI triage from human-verified labels. This small diagnostic exercise is not a corpus-wide accuracy estimate.
6. [ ] Review results with the owner; implement a simple human bookmark when useful and consider any additional quality signals based on evidence. No automatic training, giant universal schema, uncalibrated thresholds, or paid cascade.

### Current implementation versus intent
- Local, uncommitted work retains text layers, adds a text viewer and JSON export, and requests OpenRouter `mistral-ocr` for new scans; provider annotation extraction and the new structured output have **not** been live-verified. Native-vision scan runs don't contain transcripts. Old text-layer runs can be re-read from Blob. OCR can be incomplete or missing, including when the provider fails before metadata is returned.
- Existing route choice is document-level and based on text-layer coverage; it does not evaluate text accuracy, classify difficult pages, independently compare candidates, or provide a human-review bookmark. OCR can add page charges and sends material through another provider; check actual service and privacy settings before use. The app's existing viewer, export and Blob are public.
- Existing eval CLI scores core fields against confirmed labels and makes new paid calls; it is not yet a transcription/search-quality evaluator or an offline saved-run scorer. No full comparative benchmark or human-reviewed gold set has been established.

---

## Earlier milestones (to revisit after the small comparison)

The phase checklists below are historical project goals, not commitments to a 25-document/three-model sweep, queue, or specific thresholds before the new text-first work is understood.

## Context
- Solo project, ~2 weeks, $20–50 budget. `SPEC.md` is authoritative on scope.
- Stack: Next 16 App Router, pnpm, TS strict, AI SDK + `@openrouter/ai-sdk-provider`, Zod 4, Drizzle + Neon, Vercel Blob, unpdf, vitest.
- Scaffold and real-service setup are verified as detailed below; full v0 eval and visual browser checks remain.
- Docs are heterogeneous: v0 extracts searchable text and keeps a shared core envelope plus a small unscored list of document-specific suggestions; formal per-type schemas and downstream ontology/analyzer remain later work.
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

**Earlier v0 definition of done:** public URL parses an uploaded PDF end to end; 25 labelled docs; eval matrix across ≥3 models with cost; README results table + talk track. Revisit against the text-first direction and evidence above before treating this as the current release gate.

---

## Phase 5 (v1): Queue + worker + cascade

The owner confirmed a queue remains part of the v1 direction. Deferring it from the focused v0 reliability pass does not remove it from v1; exact implementation choices and cascade rules can be revisited when v1 is scoped.
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

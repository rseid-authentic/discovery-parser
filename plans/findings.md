# Discovery Parser — Findings

Full research brief with ~30 sources: `docs/research-brief.md`. This file is the condensed, decision-oriented version plus things learned while building.

## How production parsers actually work (Nov 2026)
- Nobody serious ships "page → frontier VLM." The production shape (Reducto, LlamaParse/Extract, Extend, Nutrient, Azure DI, Textract) is **hybrid**: use the PDF text layer when trustworthy (cheaper *and* more accurate), render + OCR when not, VLM only for messy single pages / handwriting / stamps / charts. Reducto routes per *region* by complexity.
- Evidence: ParseBench (Apr 2026) — VLMs 86–90% content faithfulness but **<7% visual grounding**, near zero on charts; specialized parsers win grounding. Gemini 3 Flash ≈ 0.65¢/page; bigger models did not reliably score higher. DISCO benchmark — OCR-first wins long multi-page text docs; VLM-direct wins dense single pages.
- Known VLM-OCR failure modes on scans: duplicated table blocks, dropped headers/footers, misread IDs (`JZP-110` → `I2P-110`), checkbox flips. Vendor accuracy claims disagree by 40+ points on the same forms → **only our own eval set counts**.
- Thoughtworks Radar (Apr 2026) puts end-to-end VLM parsing in *Assess*: simpler, but hallucination-prone; low-error-tolerance use cases still need hybrid or deterministic OCR.

## Structured extraction contract (industry convergence)
- Input: JSON Schema. Output: data **plus a parallel metadata tree** — per field `{ value, confidence, page, bbox?, source_text }`. We adopted this as the `Field<T>` wrapper.
- Typical thresholds to start: ≥0.90 auto-accept, 0.70–0.89 review, <0.70 reject; calibrate per doc type. Owner picks ours after the first eval run.
- Validate with the schema even when the provider claims strict mode; feed validation errors back **once or twice**, then escalate; never blindly retry semantic failures.
- Long docs: extract header/metadata fields from page 1 (+ last page for emails/memos); whole-doc text pass for the rest. Text input scales to 100+ pages; image input hallucinates more at scale.

## Model routing / cascades — reality check
- FrugalGPT's "98% savings" is 2023. LLMRouterBench (2026, 33 models, 10 routers): best routers ≈ +4% accuracy or **≤31.7% cost reduction** at best-single-model accuracy; binary cascades struggle; several routers lose to the best single model; **OpenRouter's auto-router was the worst tested (−24.7%)**.
- Document pipelines route on **document signals**, not learned routers: has text layer? OCR confidence? schema valid? totals sum? → that's our v1 cascade. Log cost per tier so the README shows measured savings, not claimed ones.

## Evals for extraction
- One scorer per field type (Braintrust, Oct 2026): ISO-normalize dates and fail ambiguous day/month; exact decimals for money; **preserve case + leading zeros for identifiers (Bates)**; enums checked against the allowed set; fuzzy/Levenshtein for names; LLM-judge only for free text (we leave `summary` unscored in v0).
- Separate failure classes: `wrong`, `omitted`, `invented`, `schema_violation`. null/null is correct. Document acceptance = separate gate on critical fields.
- Credible portfolio metrics: per-field accuracy, invented rate, doc pass rate, grounding (page hit rate; bbox IoU if we ever have boxes), cost/page + p50 latency per tier, doc-type confusion matrix.
- Public benchmarks for context: OmniDocBench, olmOCR-bench (OCR/layout quality), ParseBench (adds grounding + charts), DocVQA/DUDE (QA). Tooling: Langfuse (MIT, self-host), Braintrust (PR gating), promptfoo (CLI). We use our own CLI + JSON reports; CI gating is a v1 nice-to-have.

## E-discovery domain
- Real productions ship a Concordance/DAT load file. FTC Bureau of Competition spec fields: `BEGBATES, ENDBATES, PGCOUNT, CUSTODIAN, FROM, TO, CC, BCC, DATESENT/TIMESENT, DATERCVD, SUBJECT, ATTACHMENTID, MESSAGEID, PARENTID, FILENAME, FILEPATH, HASH`; dates and times separate; Bates zero-padded, no space after prefix; attachments numbered after parent. Logikcull adds `BegFamily/EndFamily, ThreadID, Document Date, File Author/Title`.
- → Our envelope uses this vocabulary where it overlaps (`bates_begin/end`, `author_from`, `recipients_to`, `cc`, `doc_date`, `title_or_subject`). DAT export is v2 and will be instantly recognizable to legal-tech readers.
- Relativity aiR / Everlaw / DISCO do first-pass responsiveness + privilege coding with per-doc rationale and cited snippets (vendor claims: 90%+ recall, up to 3M docs/day). Privilege flagging is a plausible v2 stretch.

## Public sample documents (clean, no sensitive data)
- **DOJ ATR trial exhibits** — *US v. Google (2020)* ~224 exhibits (emails w/ attachments, decks, chats, a financial report, UPX/PSX/DX numbering, redaction tags); *US v. Google (2023 ad tech)* 264 exhibits incl. spreadsheets. Public court record.
- **UCSF Industry Documents Library** — the only large public corpus with real Bates numbers, custodian-like metadata, and genuinely poor scans; full dataset on AWS Open Data `s3://ucsf-idl-dataset`. Check UCSF copyright page before redistributing.
- **Enron** — real email headers but stale/over-familiar (EDRM 2025 says retire it). **EDGAR** — clean financials; degrade yourself (print → scan → skew) for test data.

## Public datasets that already have labels (for Phase 6 eval expansion)
- **RVL-CDIP / Tobacco-3482** — scanned pages from the IIT-CDIP tobacco-litigation collection, i.e. real discovery documents: letters, memos, emails, forms, invoices, budgets, reports, handwritten notes, presentations. 16 classes / 400K images (RVL-CDIP) and 10 classes / 3,482 docs (Tobacco). Same genre + scan quality as ours → free **doc_type classification benchmark**. Map classes to our enum (budget → `financial_statement`, scientific report → `report`, etc.). RVL-CDIP hosting has moved around; confirm what's downloadable. Known label noise of a few percent → sanity check, not a ceiling.
- **Kleister-NDA** (~540 NDAs: parties, effective date, jurisdiction, term) and **Kleister-Charity** (long scanned financial reports) — built as "extract fields from long legal/financial docs." Partial overlap with our envelope (parties, dates); natural second schema if we go toward contracts.
- **CUAD** — 510 contracts, 41 lawyer-labelled clause types. Contract-specific; v2 if ever.
- **CORD / SROIE** (receipts), **FUNSD** (forms) — standard KIE sets, less relevant; only for comparing against widely published numbers.
- **OmniDocBench / olmOCR-bench** — OCR/layout quality, not field extraction; useful if we compare OpenRouter PDF engines (native vs mistral-ocr vs pdf-text).
- Caveats: write an **adapter per dataset** → our ground-truth JSON, score only the fields the dataset labels; don't bend the envelope to a benchmark. These sets are old and public → frontier models have likely seen them → expect inflated scores vs our unseen 25 and say so in the README (the contrast is itself a talking point). Licenses are research/non-commercial; fine for a portfolio.

## Infra / cost findings
- **BullMQ** is free (npm lib). **Redis**: Redis Cloud has a permanent free 30 MB DB (plenty for a job queue). Upstash is free to 500K commands/month but its own docs call BullMQ a poor fit for pay-as-you-go (workers poll constantly even when idle). → Redis Cloud free or local Docker for BullMQ; Upstash only if we go QStash/serverless-native instead.
- **Worker hosting**: pull-based, so it can run on the laptop for $0 during dev. Railway Hobby $5/mo (includes $5 usage; $20/vCPU, $10/GB-RAM billed per second) → a mostly idle Node worker ≈ $2–5/mo. Fly comparable. Deploy only for the demo.
- **Vercel**: sync parse of a 30-page scan can take 30–90 s → set `maxDuration = 300` on the upload route in v0. This timeout is the honest motivation for the v1 queue.
- **Cheap vision-capable models on OpenRouter (Nov 2026, verify before relying on)**: Gemini 2.5 Flash-Lite $0.10/$0.40 per M in/out; Gemini 3.1 Flash-Lite Preview $0.25/$1.50; Gemini 3 Flash Preview $0.50/$3.00; Qwen3-VL-8B $0.25/$0.75. ParseBench per-page sanity check: Gemini 3 Flash ≈ 0.65¢, GPT-5 Mini ≈ 0.88¢.
- **OpenRouter PDF input** exists with an engine option (native / mistral-ocr / pdf-text) → lets v0 skip server-side rendering entirely and makes "engine" an eval axis. The `file-parser` / `pdf.engine` shape and a native-PDF call were verified; test each engine before relying on it.
- **OpenRouter account policy** requires zero-data-retention endpoints. GPT-6 Luna text and native-PDF tests succeeded; Gemini 2.5 Flash-Lite was excluded by that policy, and the Google Claude endpoint rejected the envelope schema.

## Design decisions (see `docs/adr/`)
- **ADR 0001** hybrid routing: text layer → text model; scan → PDF to vision model. Mirrors production practice; cheapest and most accurate on text-heavy docs.
- **ADR 0002** no server-side PDF rendering in v0: OpenRouter takes the PDF; viewer embeds from Blob. Keeps Vercel-only deploy; pdf.js + bbox highlighting is v2.
- **ADR 0003** eval runner is a CLI, not a UI button: reproducible, scriptable, CI-able; results persisted to Postgres + `reports/`.
- One envelope schema for all doc types in v0 (heterogeneous corpus); classification + extraction in one call; split into triage + typed schemas later.
- CDN learning goals: content-hashed keys (`docs/<sha256>.pdf`), one-year Blob cache max age, observe cache behavior, private access + invalidation later. Initial public responses had `max-age=31536000` and `x-vercel-cache: MISS`; no HIT was observed.

## Resolved questions
- **Redis + BullMQ cost?** ~$0 in dev (Redis Cloud free + local worker), ~$5/mo deployed. See Infra.
- **Where does the queue go?** On ingest: upload route enqueues, worker parses, UI polls. v1.
- **Vision vs OCR-first?** Hybrid, routed on text-layer presence (v0) + confidence/validation signals (v1).
- **Which schema for a mixed corpus?** Envelope + `doc_type`; typed sub-schemas in v2.
- **Can we use public datasets with existing labels?** Yes — Tobacco-3482/RVL-CDIP for doc_type at scale, Kleister for legal KIE; via adapters, as Phase 6, with contamination caveat.
- **Where do planning docs live?** `plans/` (task_plan, findings, progress), same as other repos.

## Open questions
- Re-verify model ids, prices, and endpoint availability in `src/lib/models.ts` before each eval sweep. GPT-6 Luna returned usage and cost through the AI SDK in both tested modes.
- Which 3–4 fields are "critical" for the pass gate? Owner decides in Phase 1.
- Confidence threshold for v1 escalation — pick after the first eval matrix, not before.
- RVL-CDIP current hosting / download path.

## Blockers
Visual browser verification is pending because the browser host was unavailable. The user-supplied ZIP's public/synthetic status is unconfirmed; do not upload it to public storage or commit it.

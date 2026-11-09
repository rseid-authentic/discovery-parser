# Discovery Parser — Progress

## 2026-11-08: Focused v0 reliability implementation

- Local-only: upload requires a server-side token (missing/short disables it), warns about public/provider exposure, and rejects files over 4 MB or 25 pages before Blob/model operations. Token and page cap are not an aggregate spend limit; retain the configured OpenRouter account cap. Existing deployed code is unchanged.
- Auto-routing sends a whole PDF to the PDF/OCR path if any page lacks the minimum text threshold; explicit overrides remain. The existing text layer is retained separately on a schema-valid mixed-PDF run. A blank page can trigger OCR; text-layer presence/coverage is not accuracy proof.
- Invalid extractions no longer receive correct absent-field scores or a document pass. Unknown or partial costs remain unknown; known-cost coverage is reported. Eval provider failures are persisted separately; database failures propagate rather than being described as provider errors.
- Viewer and export select the same readable success, identify its run, and expose a newer failure. A run-specific JSON export prevents a later run from changing the text behind an already-open viewer. Already-extracted PDF text is kept on an upload's model exception.
- No automatic duplicate retry, general stale-job recovery, worker/queue, human-review bookmark or automatic difficulty classifier was added. Duplicate failed/missing-file recovery remains manual/deferred; the queue remains v1. No paid calls, production migrations, deployments, or pushes were performed.
- Verification on Node 24: typecheck, lint, 39 tests and build passed; local HTTP smoke returned 200 for `/` and 401 for an unauthorized upload. Live OCR, deployment, actual Vercel token configuration and a visual browser check remain unverified. A random local upload token was added to `.env.local` without exposing its value.

## 2026-11-08: Red-team and code-review scope reconciliation

- Owner agreed on mixed-page safety, small local route comparisons, a simple human-review flag, and a small diagnostic sample. Prefer whole-document OCR for mixed PDFs as a conservative v0 option; keep original text separately where practical and don't claim OCR is perfect or that an empty page isn't genuinely blank.
- Independent review overlaps on mixed-page routing, run visibility, and evaluation integrity. Confirmed code currently treats unknown costs as zero and can score absent fields as correct after an extraction failure; address before trusting those reports.
- Public upload protection is a meaningful demo risk because the deployed endpoint can invoke paid services; plan server-side authorization or disabling public uploads, clear public-data messaging, and a genuine spend bound while retaining read-only viewing.
- Owner does not want production-engineering tunnel vision in the v0 pass: recover already-extracted text after model failure only if straightforward; defer stale-job recovery, concurrency orchestration, the v1 queue, and a broad new eval system. Keep prior successes visible and avoid silent duplicate paid retries. Owner confirmed a queue is still planned for v1; deferral from v0 is not cancellation.
- Plans only: no implementation, new paid calls, deployments, deletions, or live-service mutations in this reconciliation. The older code-review pass specifically excludes paid calls/deployment unless separately requested.

## 2026-11-08: Text-first plan and human-review direction

- Owner clarified the parser's primary job is making document text useful for search and a separate downstream agent. Structured core metadata and document-specific suggestions support that; implementing the downstream analyzer or ontology is out of scope.
- Agreed to preserve the distinction between original PDF text, OCR and candidate vision transcription; text-layer presence alone does not establish accuracy, and mixed documents may have image-only pages. Preserve originals and source/version/page references when actually known.
- Owner proposed bookmarking material that is too difficult for reliable automated extraction for a human to inspect. This is a proposed workflow: no difficulty detector, bookmark storage/UI, automated cascade, or claim of complete coverage is implemented. Page-level flagging depends on available grounding; otherwise flag the document.
- Next proposed experiment: one bounded live OCR verification, then roughly 5–10 diverse easy/hard pages comparing original, inherited text, OCR, and actual vision transcription where appropriate. Track omissions/search misses and consequential details as well as layout; independently verify selected snippets rather than treating AI triage or incomplete dataset labels as gold. Review reuse terms and service privacy before sending or publishing samples.
- No OCR/model calls, deployments, or code changes were made in this planning update. Prior local implementation remains uncommitted; the new OCR route/schema have not been live-verified. The existing public app and Blob must not be assumed private.

## 2026-11-08: Core + details and review loop

- Added backward-compatible saved-run reading and strict new-call output for unscored document-specific details and a date-uncertainty explanation. Prompt instructs the model to preserve ambiguous source dates without guessing.
- User clarified the primary output is document text for search/downstream agents, with structured fields as supporting data. New text-layer runs retain text; PDF scans request `mistral-ocr` and retain provider file-annotation text when returned. Added a text tab and public JSON export. Old text-layer PDFs can be re-read without an AI call; native-only scan runs require a fresh OCR run. OCR output and provider annotation availability are not guaranteed, and OCR is unverified against a live call.
- PDF OCR changes model input from native vision to OCR-derived content and adds page charges; existing engine overrides still permit comparison. Parser-backed PDFs default to no automatic repair to avoid re-paying for OCR. Recovered OCR text is retained even when structured output validation fails, when the provider metadata was available; missing text is not evidence the document is empty.
- Viewer distinguishes text input, requested PDF engines, provider-default unknown, and failures with unknown routes. Requested engine is not verification of provider execution.
- Review continues to treat proposed drafts as unreviewed; unresolved dates block final export, and final labels with unresolved-field metadata are rejected. Unknown must not be scored as absent.
- Existing eval CLI makes paid model calls; no saved-run offline scorer, automatic training, or document-specific scoring has been added. Preserve original extraction runs and local browser review progress.
- Added `plans/independent-review-prompt.md` for a separate read-only review session. New model output schema has not yet been tested against a live provider.

## Status: Real services wired and deployed; one public PDF parsed locally — visual verification and v0 eval remain

## Completed
- [x] Scoped v0/v1/v2 with Claude (Cowork): envelope schema + provenance, hybrid routing, eval CLI first; queue/worker + cascade in v1
- [x] Research pass on current parsing workflows, extraction contracts, routing benchmarks, eval practice, e-discovery load-file schema, public sample sources → `docs/research-brief.md`, condensed in `plans/findings.md`
- [x] Cost check: Redis Cloud free tier + local/Railway worker; BullMQ free
- [x] Architecture diagram (Excalidraw) reviewed; remaining fixes: re-add viewer box (reads Postgres + R2), evals fed from validate box + ground-truth box, dash queue/consumer as v1, fix "rery once"
- [x] Scaffold: Next 16.4.5, ai 7.0.165, @openrouter/ai-sdk-provider 3.1.0, zod 4.6.7, drizzle-orm 0.45.4, unpdf, vitest
  - `src/lib/schema/envelope.ts` Field wrapper + Envelope + ground-truth schema
  - `src/db/schema.ts` documents, extraction_runs, ground_truth, eval_runs, eval_results
  - `src/lib/parse/` text-layer, route, prompt, extract (one bounded repair retry)
  - `src/lib/eval/` scorers (16 tests), score-envelope, report
  - `scripts/` eval, bootstrap-labels, upload-samples
  - `src/app/` upload page/route, document viewer, runs page
  - `SPEC.md`, `AGENTS.md`, `CLAUDE.md`, ADRs 0001–0003, `.env.example`, `docs/setup-prompt-for-claude-code.md`
- [x] Written to `~/Documents/code/personal/discovery-parser` (59 files, no node_modules)

## Deferred Items
- shadcn/ui (plain Tailwind in v0; add if the viewer needs real components)
- CI eval gating (Langfuse/promptfoo) — v1 nice-to-have
- pdf.js + bbox highlighting — v2
- DAT load-file export — v2
- Public labelled datasets (Tobacco-3482 / RVL-CDIP, Kleister) — Phase 6

## Historical scaffold verification (cloud workspace, no `.env.local`)
- Typecheck: pass
- Lint: pass
- Tests: 16/16
- Build: pass
- `data/ground-truth/example.json` validates against ground-truth schema
- At that time, live services and model details were not yet verified; see subsequent session notes.

## Session Notes
### 2026-11-08 — Image-only scan pilot
- Converted five new SROIE receipt JPEGs and five FATURA synthetic invoice JPEGs into one-page image-only PDFs locally. All ten routed to native-PDF mode and returned schema-valid output with GPT-6 Luna; reported total cost $0.01339515, with no repair retries. This was an exploratory pilot, not a formal eval.
- All five FATURA invoice dates matched the supplied annotation after normalization. On SROIE, one date was omitted and one was read with the wrong year; the remaining three matched using day-first for numeric dates (one of those dates is ambiguous without that convention). The 2008-versus-2018 mismatch was checked against the image; the model also read TAX INVOICE as FAX INVOICE with 99% confidence.
- At the time of the pilot the envelope had no invoice totals, addresses, or bounding boxes, so those dataset labels were not scored. The converted PDFs and outputs remain under `/private/tmp/discovery-parser-image-pilot-20261108/` and `/private/tmp/discovery-parser-image-results-20261108/`. Three SROIE receipts and their saved runs were subsequently added to the public viewer, with proposed unreviewed drafts; the remaining pilot results were not added in that step.
- A separate in-session visual check compared selected date, merchant, and title fields across the five SROIE images: four have corrections or an ambiguous date convention; one looks consistent on the fields inspected. Findings are in `vision-triage.json` in the temporary results folder. This was not blinded or a full-envelope evaluation and does not create human-reviewed ground truth.
- Standards research found no single universal antitrust schema: sent, received, created, modified, and effective dates are distinct. Agree on definitions for current fields, evidence, and absent versus unknown before finalizing gold labels; avoid inferring custodian or attachment metadata from a PDF alone.

### 2026-11-08 — UCSF and Kleister pilot
- Ran three UCSF litigation PDFs (`ffbb0002`, `ffbb0006`, `ffbb0005`) and the three Kleister NDA PDFs from `/Users/marshall/Documents/document-parser-samples/manifest.csv` through GPT-6 Luna sequentially, with no schema-repair retries. All six were schema-valid; reported total cost was $0.007668765.
- All six were routed through extracted text, including the noisy OCR case; this was not a scan/PDF-route test. Results were saved under `/private/tmp/discovery-parser-six-pilot-20261108/`. At the owner's request, the six source PDFs and existing runs were subsequently added to the public Blob-backed app; redistribution terms remain unconfirmed. They are not human-scored ground truth.
- `ffbb0002`'s extracted `FROM:` field is blank while the model selected an author; human review is needed before judging it. NDA party labels and our broader `organizations` field have different semantics and cannot be compared as identical sets.
- A delegated review-UI cleanup improved long-value wrapping, compact responsive rows, progress feedback, and export guidance without changing browser-local persistence or the evaluator label schema. Typecheck, lint, 18 tests, and build passed; this latest visual revision was not rechecked in a browser.

### 2026-11-08 — Synthetic pilot
- Owner confirmed `test 2.zip` is synthetic; it remains excluded from Git and deployment. It contains 19 PDFs in `test/images/` plus native/text/load-file material.
- Ran three selected PDFs through the local upload route: a synthetic email (1 page, $0.00059032), chat transcript (1 page, $0.00068744), and test-set generator code (5 pages, $0.00160157). All had text layers and produced schema-valid outputs; total reported pilot cost $0.00287933. These are not scan tests or a scored evaluation.
- Chat extraction included an assistant label and an ambiguous `x` label in `people`; the code PDF illustrates that this corpus contains generator artifacts as well as simulated corporate records. Field definitions and human labels remain to be discussed.
- Inspected `invoice-eval`'s reusable `AnnotationForm`: navigation, pass/fail judgments, comments, and autosave are useful patterns, but its judgment schema does not itself produce corrected discovery ground-truth envelopes.
- Added a compact Review tab to parsed-document pages. Edits and progress stay in the current browser; after every field is reviewed, the user downloads a schema-validated label for `data/ground-truth/`. The matching PDF must also be in `data/samples/`. No public server-side write endpoint was added.

### 2026-11-08 — Neon setup
- Private GitHub repository is `rseid-authentic/discovery-parser`; initial scaffold commit pushed to `main`.
- Linked Neon project `discovery-parser`, branch `production`; `neon deploy` reported no policy changes and pulled local environment variables.
- Applied Drizzle schema to the empty database and verified all five expected tables. Local production server returned HTTP 200 and the database-backed empty documents state.
- `npm run build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` (16 tests) passed. R2, OpenRouter, Vercel, and a real PDF parse remain outstanding.

### 2026-11-08 — Vercel Blob decision
- Owner chose Vercel Blob on the Hobby plan instead of R2 to avoid Blob overage charges; the original R2 steps below are superseded.
- Switched local storage integration to Blob and removed the AWS SDK; live Blob upload and CDN checks remain unverified pending Vercel sign-in and store setup.
- Typecheck, lint, 16 tests, and build passed; an empty local upload POST returned HTTP 400. Browser uploads are limited to 4 MB due to Vercel's function request limit.
- Vercel CLI is installed but its existing token is invalid. OpenRouter and the full PDF parse remain outstanding.
- Follow-up: signed into Vercel as `rseid` and verified `ryans-projects-7d8cba28` is Hobby. Linked `discovery-parser`, created the public `discovery-parser-docs` Blob store in `iad1`, and added Neon variables to Preview and Production.
- Live Blob helper write and public reads succeeded (HTTP 200; one-year max-age); repeated upload reused the object. Both observed responses were cache MISS, so a HIT is not yet proven.
- GitHub auto-connect failed for private `rseid-authentic/discovery-parser`; investigate GitHub app access. OpenRouter key, deployed smoke test, and real PDF parse remain outstanding.
- Follow-up: GitHub connection succeeded. Deployed `https://discovery-parser.vercel.app`; home returned 200, empty upload returned 400, and rendered document HTML contained the extracted fields and Blob PDF iframe. Browser host unavailable, so visual layout remains unchecked.
- Public DOJ exhibit PXR0088 parsed successfully via the local upload route using GPT-6 Luna. One synthetic text call, the PDF's text-layer parse, and a separate native-PDF call cost $0.005567805 in total as reported by OpenRouter. The original Gemini default was blocked by the account ZDR policy; the Google Claude endpoint rejected the schema.
- The user-supplied ZIP remains unclassified and is excluded from Git and deployment; it was not uploaded.

### 2026-11-08
- Planning session in Cowork. Key decisions: envelope-for-everything in v0; no server-side PDF rendering (OpenRouter native PDF + engine option); eval CLI as the centerpiece; queue on ingest in v1 motivated by Vercel timeout; deterministic cascade over learned router (LLMRouterBench).
- Research agent (~136K tokens) produced the brief; scaffold agent built ~80% before a stop; a smaller agent finished docs + verification.
- Planning assumed clean/public samples; the later user-supplied ZIP has not been classified and must not be uploaded or committed until confirmed.
- Next: run `docs/setup-prompt-for-claude-code.md` in Claude Code from the project folder (Phase 0), then Phase 1 labelling (owner).

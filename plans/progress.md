# Discovery Parser — Progress

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
### 2026-11-08 — UCSF and Kleister pilot
- Ran three UCSF litigation PDFs (`ffbb0002`, `ffbb0006`, `ffbb0005`) and the three Kleister NDA PDFs from `/Users/marshall/Documents/document-parser-samples/manifest.csv` through GPT-6 Luna sequentially, with no schema-repair retries. All six were schema-valid; reported total cost was $0.007668765.
- All six were routed through extracted text, including the noisy OCR case; this was not a scan/PDF-route test. Results were saved under `/private/tmp/discovery-parser-six-pilot-20261108/` and source PDFs were not uploaded to public Blob. They are not human-scored ground truth.
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

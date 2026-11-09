# Independent project review prompt

Paste this into a fresh Codex session in this repository:

> Independently review this entire discovery-parser project as it exists now, including the code and documentation already committed and pushed, and separately assess any uncommitted changes. Start by reading AGENTS.md, CLAUDE.md, SPEC.md, the relevant plans, Git status and commit history. Identify the exact commit and dirty files you reviewed. Read the relevant bundled Next.js documentation before making any claims that depend on framework behavior.
>
> This is a **read-only review**, not an implementation task. Do not modify files, commit, push, deploy, create resources, run migrations, upload documents, make paid model calls, or change service/database state. Don't print secrets. Preserve any dirty work and running services. Inspect GitHub/Vercel state only if useful and available without mutation.
>
> Trace the actual upload → storage → text-layer detection/routing → OpenRouter extraction → database → viewer/review → evaluation flows. Look for correctness and security issues, misleading UI or unsupported claims, cost/usage errors, backward compatibility, unsafe handling of private documents or public Blob URLs, failure/retry behavior, date ambiguity and absent-versus-unknown semantics, source attribution and sample reuse, ground-truth contamination, eval/scoring flaws, and model/provider assumptions. Pay particular attention to differences between requested and actually observed routes, untrusted PDF/model output, and any correctness claims made by docs or the UI.
>
> Verify high-impact findings against actual code paths and appropriate non-mutating checks. Distinguish reproducible issues from hypotheses, pre-existing behavior from newly introduced changes, and local tests from live-provider or deployed-app evidence. Do not call something an issue just because it is a possible future feature or because the project is a demo. Note meaningful risks to users and the evaluation results, not style preferences.
>
> Return findings first, ordered by severity, with file:line links, a concrete scenario and impact, and what was verified versus inferred. Then list important testing gaps, any questions or decisions Marshall needs to make, and a concise overall assessment. If no material findings exist, say so and explain remaining uncertainty. Do not fix or post anything.

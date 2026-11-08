# Claude Code prompt: GitHub + Vercel + Neon + R2 setup

Paste everything below the line into Claude Code, run from `~/Documents/code/personal/discovery-parser`.
It assumes `gh` and `vercel` CLIs are installed and logged in to your personal accounts.
Delete this file once setup is done (or keep it as a record).

---

I'm in `~/Documents/code/personal/discovery-parser`, a freshly scaffolded Next.js 16 / pnpm / TypeScript project (already verified: typecheck, lint, test, build all pass). Read `CLAUDE.md`, `SPEC.md` and `.env.example` first. Then set up the infrastructure, **showing me each command before running it** and stopping if anything needs a decision.

1. **Install + sanity check.** `pnpm install`, then `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Confirm all pass before touching git.

2. **Git + GitHub.** `git init -b main`, make sure `.gitignore` covers `.env*.local`, `node_modules`, `.next`, `.vercel`, `reports/`, `data/samples/private/`. First commit message: `scaffold: next 16 + ai sdk + openrouter + drizzle; build passes`. Create a **private** repo on my personal GitHub with `gh repo create discovery-parser --private --source=. --push`. Confirm the remote and that `main` is pushed.

3. **Neon Postgres.** If the `neonctl` CLI is installed and logged in, create a project `discovery-parser` (region closest to US East) and grab the pooled connection string; otherwise tell me to create it in the Neon console and paste the `DATABASE_URL` here. Put it in `.env.local`. Run `pnpm db:push` and confirm the tables from `src/db/schema.ts` exist (`pnpm db:studio` or a quick query).

4. **Cloudflare R2.** I'll create the bucket `discovery-parser-docs` and an API token in the Cloudflare dashboard myself. Prompt me for `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` and write them to `.env.local`. Remind me to enable public access (or a custom domain) on the bucket so `R2_PUBLIC_BASE_URL` serves files through Cloudflare's CDN, and to set a CORS rule allowing GET from my Vercel domain and `localhost:3000`. Then verify with a one-off `tsx` script that `putObject` + fetching the public URL works and that the response carries `cache-control: public, max-age=31536000, immutable` and a `cf-cache-status` header.

5. **OpenRouter.** Prompt me for `OPENROUTER_API_KEY`, add to `.env.local`. Set `DEFAULT_TEXT_MODEL` and `DEFAULT_VISION_MODEL` to the cheap defaults from `src/lib/models.ts`. Verify with a one-off `tsx` script that a tiny structured-output call via `src/lib/parse/extract.ts` succeeds and that OpenRouter returns usage (and cost if `usage: { include: true }` is supported). Fix `src/lib/models.ts` model ids/prices against https://openrouter.ai/models if any are wrong, and check the PDF plugin option shape in `extract.ts` against https://openrouter.ai/docs (the `file-parser` plugin / `engine` field) and correct it if it has changed.

6. **Vercel.** `vercel link` to a new project `discovery-parser` on my personal scope (framework Next.js, root dir `.`), then push every var from `.env.local` to Vercel's Production and Preview environments with `vercel env add` (or `vercel env pull`/push flow — whichever is current). Enable Vercel's GitHub integration so pushes to `main` deploy. Trigger a production deploy and give me the URL. Check that the deployed `/` renders and that `/api/upload` returns a sensible error on an empty POST rather than a 500 from missing env.

7. **Smoke test end to end.** Drop one public PDF into `data/samples/` (e.g. a US v. Google trial exhibit from justice.gov), run `pnpm samples:upload`, open the document page locally, and confirm fields render beside the embedded PDF. Then commit with `infra: neon + r2 + vercel wired; first doc parses end to end` and push.

8. **Report back:** repo URL, Vercel URL, which steps I still need to do manually, and anything in the code you had to change to make the real services work (so I can review the diff).

Do not add new dependencies, abstractions, or v1 features (queue, worker, cascade) during this. Scope is strictly: make v0 run against real services.

import "./lib/load-env";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { requireModel } from "@/lib/models";
import { runRoute } from "@/lib/parse/route";
import type { GroundTruthEnvelope } from "@/lib/schema/envelope";
import { GROUND_TRUTH_DIR, loadSamples } from "./lib/samples";

/**
 * Runs a frontier model once per sample and writes
 * data/ground-truth/<name>.draft.json for the USER to hand-correct.
 *
 * Drafts are NOT ground truth: `pnpm eval` ignores `*.draft.json` and refuses
 * files whose `_meta.draft` flag is still true. Review every field against the
 * PDF, fix it, remove `_meta.draft`, and save as <name>.json.
 *
 * Usage: pnpm eval:bootstrap [--model anthropic/claude-sonnet-5.5] [--docs 'UPX*.pdf'] [--force]
 */
const { values } = parseArgs({
  options: {
    model: { type: "string", default: "anthropic/claude-sonnet-5.5" },
    docs: { type: "string", default: "*.pdf" },
    force: { type: "boolean", default: false },
  },
});

const model = requireModel(values.model!).id;
const samples = loadSamples(values.docs);
mkdirSync(GROUND_TRUTH_DIR, { recursive: true });
console.log(`Drafting labels for ${samples.length} sample(s) with ${model}`);

let totalCost = 0;
let unknownCosts = false;
for (const sample of samples) {
  const finalPath = join(GROUND_TRUTH_DIR, `${sample.name}.json`);
  const draftPath = join(GROUND_TRUTH_DIR, `${sample.name}.draft.json`);
  if (existsSync(finalPath)) {
    console.log(`skip ${sample.name}: final label exists`);
    continue;
  }
  if (existsSync(draftPath) && !values.force) {
    console.log(`skip ${sample.name}: draft exists (use --force to overwrite)`);
    continue;
  }
  process.stdout.write(`${sample.name} ... `);
  const { plan, result } = await runRoute(sample.bytes, `${sample.name}.pdf`, { model });
  if (result.costUsd === null) unknownCosts = true;
  else totalCost += result.costUsd;
  if (!result.envelope) {
    console.log(`FAILED schema after ${result.attempts} attempt(s): ${result.zodError ?? "unknown"}`);
    continue;
  }
  const draft: GroundTruthEnvelope = {
    _meta: {
      draft: true,
      model,
      generated_at: new Date().toISOString(),
      notes: `AUTO-GENERATED DRAFT via ${plan.inputMode} mode. Verify every field against the PDF, then remove _meta.draft and rename to ${sample.name}.json`,
    },
    ...result.envelope,
  };
  writeFileSync(draftPath, JSON.stringify(draft, null, 2) + "\n");
  console.log(`wrote ${draftPath} (${result.latencyMs}ms, ${result.costUsd === null ? "cost unknown" : `$${result.costUsd.toFixed(4)}`})`);
}
console.log(`Done. ${unknownCosts ? `Total cost unknown; known costs $${totalCost.toFixed(4)}` : `Approx cost $${totalCost.toFixed(4)}`}.`);

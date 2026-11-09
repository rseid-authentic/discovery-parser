import "./lib/load-env";
import { parseArgs } from "node:util";
import { db, schema } from "@/db";
import { requireModel } from "@/lib/models";
import { analyzeTextLayer } from "@/lib/parse/text-layer";
import { planRoute } from "@/lib/parse/route";
import { extractEnvelope, type PdfEngine } from "@/lib/parse/extract";
import { PROMPT_VERSION } from "@/lib/parse/prompt";
import { scoreEnvelope } from "@/lib/eval/score-envelope";
import { printReport, summarize, writeReport, type DocResult } from "@/lib/eval/report";
import { ensureDocument } from "./lib/documents";
import { loadGroundTruth, loadSamples } from "./lib/samples";

/**
 * Usage:
 *   pnpm eval --models google/gemini-2.5-flash-lite,openai/gpt-5-mini --name baseline
 *   pnpm eval --models qwen/qwen3-vl-8b-instruct --mode pdf --engine mistral-ocr --docs 'UPX*.pdf'
 *
 * For each doc x model: extract -> insert extraction_run -> score vs ground truth
 * -> insert eval_results -> print report and write reports/<timestamp>.json.
 * Docs without a (non-draft) ground-truth file are skipped.
 */
const { values } = parseArgs({
  options: {
    models: { type: "string" },
    mode: { type: "string", default: "auto" },
    engine: { type: "string" },
    docs: { type: "string", default: "*.pdf" },
    name: { type: "string" },
  },
});

const modelIds = (values.models ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (modelIds.length === 0) {
  console.error("--models is required (comma-separated OpenRouter ids). See src/lib/models.ts.");
  process.exit(1);
}
modelIds.forEach(requireModel);

const mode = values.mode as "auto" | "text" | "pdf";
if (!["auto", "text", "pdf"].includes(mode)) throw new Error(`bad --mode ${mode}`);
const engine = values.engine as PdfEngine | undefined;
if (engine && !["native", "mistral-ocr", "cloudflare-ai", "pdf-text"].includes(engine)) throw new Error(`bad --engine ${engine}`);
const runName = values.name ?? `eval-${new Date().toISOString().slice(0, 16)}`;

const samples = loadSamples(values.docs);
const labelled = samples
  .map((s) => ({ sample: s, truth: loadGroundTruth(s.name) }))
  .filter((x): x is { sample: (typeof samples)[number]; truth: NonNullable<ReturnType<typeof loadGroundTruth>> } =>
    Boolean(x.truth),
  );
console.log(`${samples.length} sample(s) matched, ${labelled.length} with ground truth.`);
if (labelled.length === 0) process.exit(1);

const config = { models: modelIds, mode, engine: engine ?? null, docs: values.docs };
const [evalRun] = await db().insert(schema.evalRuns).values({ name: runName, config }).returning();
console.log(`eval_run ${evalRun.id} "${runName}"`);

const results: DocResult[] = [];

for (const { sample, truth } of labelled) {
  const doc = await ensureDocument(`${sample.name}.pdf`, sample.bytes);
  const textLayer = await analyzeTextLayer(sample.bytes);

  for (const modelId of modelIds) {
    const plan = planRoute(textLayer, { mode, model: modelId, pdfEngine: engine });
    process.stdout.write(`${sample.name} x ${modelId} [${plan.inputMode}${plan.pdfEngine ? "/" + plan.pdfEngine : ""}] ... `);

    let r;
    const started = Date.now();
    try {
      r = await extractEnvelope({
        model: modelId,
        pdfEngine: plan.pdfEngine,
        source:
          plan.inputMode === "text"
            ? { kind: "text", text: textLayer.text }
            : { kind: "pdf", bytes: sample.bytes, filename: `${sample.name}.pdf` },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const scores = scoreEnvelope(truth, null);
      const latencyMs = Date.now() - started;
      // Provider failures are real eval outcomes. Database failures below must
      // propagate rather than masquerade as provider failures or a complete run.
      const [failedRun] = await db().insert(schema.extractionRuns).values({
        documentId: doc.id, model: modelId, inputMode: plan.inputMode,
        pdfEngine: plan.pdfEngine ?? null, promptVersion: PROMPT_VERSION, schemaValid: false,
        error: message, latencyMs,
      }).returning();
      await db().insert(schema.evalResults).values(scores.map((s) => ({
        evalRunId: evalRun.id, extractionRunId: failedRun.id, field: s.field,
        expected: s.expected ?? null, actual: s.actual ?? null, scorer: s.scorer,
        score: s.score, status: s.status,
      })));
      results.push({ model: modelId, doc: sample.name, inputMode: plan.inputMode, pdfEngine: plan.pdfEngine ?? null, schemaValid: false, costUsd: null, latencyMs, inputTokens: undefined, outputTokens: undefined, scores, error: message });
      console.log(`ERROR ${message}`);
      continue;
    }

    const [run] = await db()
      .insert(schema.extractionRuns)
      .values({
        documentId: doc.id,
        model: modelId,
        inputMode: plan.inputMode,
        pdfEngine: plan.pdfEngine ?? null,
        promptVersion: r.promptVersion,
        output: r.envelope ?? (r.extractedText ? { raw_output: safeJson(r.raw), extracted_text: r.extractedText } : safeJson(r.raw)),
        schemaValid: r.schemaValid,
        error: r.zodError ?? null,
        inputTokens: r.usage.inputTokens ?? null,
        outputTokens: r.usage.outputTokens ?? null,
        costUsd: r.costUsd?.toFixed(8) ?? null,
        latencyMs: r.latencyMs,
      })
      .returning();

    const scores = scoreEnvelope(truth, r.envelope);
    await db()
      .insert(schema.evalResults)
      .values(
        scores.map((s) => ({
          evalRunId: evalRun.id,
          extractionRunId: run.id,
          field: s.field,
          expected: s.expected ?? null,
          actual: s.actual ?? null,
          scorer: s.scorer,
          score: s.score,
          status: s.status,
        })),
      );

    const result: DocResult = {
      model: modelId,
      doc: sample.name,
      inputMode: plan.inputMode,
      pdfEngine: plan.pdfEngine ?? null,
      schemaValid: r.schemaValid,
      costUsd: r.costUsd,
      latencyMs: r.latencyMs,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      scores,
    };
    const correct = scores.filter((s) => s.status === "correct").length;
    console.log(`${correct}/${scores.length} fields, ${r.latencyMs}ms, ${r.costUsd === null ? "cost unknown" : `$${r.costUsd.toFixed(4)}`}`);
    results.push(result);
  }
}

const summaries = summarize(results);
printReport(summaries);
const path = writeReport({
  name: runName,
  createdAt: new Date().toISOString(),
  config: { ...config, evalRunId: evalRun.id },
  summaries,
  results,
});
console.log(`\nWrote ${path}`);

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

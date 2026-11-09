import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { documentPasses, SCORED_FIELDS, type FieldScore } from "./score-envelope";

/** One document x model outcome, as produced by scripts/eval.ts. */
export type DocResult = {
  model: string;
  doc: string;
  inputMode: "text" | "pdf";
  pdfEngine: string | null;
  schemaValid: boolean;
  costUsd: number | null;
  latencyMs: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  scores: FieldScore[];
  error?: string;
};

export type ModelSummary = {
  model: string;
  docs: number;
  schemaValidRate: number;
  docPassRate: number;
  /** field -> mean score in [0,1] */
  accuracyByField: Record<string, number>;
  /** field -> rate of each status */
  omittedRate: number;
  inventedRate: number;
  schemaViolationRate: number;
  meanFieldAccuracy: number;
  totalCostUsd: number | null;
  costPerDocUsd: number | null;
  knownCostRuns: number;
  p50LatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type Report = {
  name: string;
  createdAt: string;
  config: Record<string, unknown>;
  summaries: ModelSummary[];
  results: DocResult[];
};

export function summarize(results: DocResult[]): ModelSummary[] {
  const byModel = new Map<string, DocResult[]>();
  for (const r of results) {
    const arr = byModel.get(r.model) ?? [];
    arr.push(r);
    byModel.set(r.model, arr);
  }
  const out: ModelSummary[] = [];
  for (const [model, rs] of byModel) {
    const all = rs.flatMap((r) => r.scores);
    const accuracyByField: Record<string, number> = {};
    for (const f of SCORED_FIELDS) {
      const fs = all.filter((s) => s.field === f);
      accuracyByField[f] = fs.length ? mean(fs.map((s) => s.score)) : 0;
    }
    const rate = (st: FieldScore["status"]) =>
      all.length ? all.filter((s) => s.status === st).length / all.length : 0;
    const costs = rs.flatMap((r) => r.costUsd === null ? [] : [r.costUsd]);
    const completeCosts = costs.length === rs.length;
    out.push({
      model,
      docs: rs.length,
      schemaValidRate: rs.filter((r) => r.schemaValid).length / rs.length,
      docPassRate: rs.filter((r) => r.schemaValid && documentPasses(r.scores)).length / rs.length,
      accuracyByField,
      omittedRate: rate("omitted"),
      inventedRate: rate("invented"),
      schemaViolationRate: rate("schema_violation"),
      meanFieldAccuracy: all.length ? mean(all.map((s) => s.score)) : 0,
      totalCostUsd: completeCosts ? sum(costs) : null,
      costPerDocUsd: completeCosts ? sum(costs) / rs.length : null,
      knownCostRuns: costs.length,
      p50LatencyMs: percentile(
        rs.map((r) => r.latencyMs),
        0.5,
      ),
      totalInputTokens: sum(rs.map((r) => r.inputTokens ?? 0)),
      totalOutputTokens: sum(rs.map((r) => r.outputTokens ?? 0)),
    });
  }
  return out.sort((a, b) => b.docPassRate - a.docPassRate || (a.costPerDocUsd ?? Infinity) - (b.costPerDocUsd ?? Infinity));
}

export function printReport(summaries: ModelSummary[]): void {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const usd = (x: number | null) => x === null ? "unknown" : `$${x.toFixed(4)}`;

  console.log("\n=== Per-model summary ===");
  console.table(
    summaries.map((s) => ({
      model: s.model,
      docs: s.docs,
      "schema ok": pct(s.schemaValidRate),
      "doc pass": pct(s.docPassRate),
      "field acc": pct(s.meanFieldAccuracy),
      omitted: pct(s.omittedRate),
      invented: pct(s.inventedRate),
      violations: pct(s.schemaViolationRate),
      "cost/doc": usd(s.costPerDocUsd),
      "cost known": `${s.knownCostRuns}/${s.docs}`,
      "p50 ms": s.p50LatencyMs,
    })),
  );

  console.log("=== Accuracy by field ===");
  const rows: Record<string, Record<string, string>> = {};
  for (const f of SCORED_FIELDS) {
    rows[f] = {};
    for (const s of summaries) rows[f][shortModel(s.model)] = pct(s.accuracyByField[f] ?? 0);
  }
  console.table(rows);
}

export function writeReport(report: Report, dir = "reports"): string {
  mkdirSync(dir, { recursive: true });
  const stamp = report.createdAt.replace(/[:.]/g, "-");
  const path = join(dir, `${stamp}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

function shortModel(id: string): string {
  return id.split("/").pop() ?? id;
}

function mean(xs: number[]): number {
  return xs.length ? sum(xs) / xs.length : 0;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

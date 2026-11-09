import { describe, expect, it } from "vitest";
import { GroundTruthEnvelopeSchema, EnvelopeSchema } from "../schema/envelope";
import { scoreEnvelope, documentPasses } from "./score-envelope";
import { summarize, type DocResult } from "./report";

const field = (value: unknown) => ({ value, confidence: 0.9, page: null, source_text: null });
const source = { doc_type: field(null), title_or_subject: field(null), doc_date: field(null), author_from: field(null), recipients_to: [], cc: [], organizations: [], people: [], bates_begin: field(null), bates_end: field(null), page_count: field(1), has_privilege_legend: field(false), has_redactions: field(false), language: field("en"), summary: "test", overall_confidence: 0.9 };
const expected = GroundTruthEnvelopeSchema.parse(source);
const actual = EnvelopeSchema.parse(source);

function result(model: string, costUsd: number | null, valid = true): DocResult {
  return { model, doc: "doc", inputMode: "text", pdfEngine: null, schemaValid: valid, costUsd, latencyMs: 1, inputTokens: 1, outputTokens: 1, scores: scoreEnvelope(expected, valid ? actual : null) };
}

describe("evaluation reporting", () => {
  it("never credits absent fields or passes an invalid extraction", () => {
    const failed = scoreEnvelope(expected, null);
    expect(failed.every((s) => s.score === 0 && s.status === "schema_violation")).toBe(true);
    expect(documentPasses(failed)).toBe(false);
    expect(scoreEnvelope(expected, actual).find((s) => s.field === "doc_date")).toBeUndefined();
    expect(summarize([result("valid", 0)])[0].docPassRate).toBeNull();
    expect(summarize([result("failed", null, false)])[0].docPassRate).toBeNull();
  });
  it("uses the same label-defined pass cohort across models and counts eligible failures", () => {
    const eligibleTruth = GroundTruthEnvelopeSchema.parse({ ...source, doc_type: field("email"), doc_date: field("2024-01-01"), bates_begin: field("A1"), bates_end: field("A2") });
    const success = EnvelopeSchema.parse({ ...source, doc_type: field("email"), doc_date: field("2024-01-01"), bates_begin: field("A1"), bates_end: field("A2") });
    const good = { ...result("good", 0), scores: scoreEnvelope(eligibleTruth, success) };
    const fail = { ...result("failed", null, false), scores: scoreEnvelope(eligibleTruth, null) };
    const rows = summarize([good, result("good", 0), fail, result("failed", null, false)]);
    const byModel = Object.fromEntries(rows.map((row) => [row.model, row]));
    expect(byModel.good.docPassRate).toBe(1);
    expect(byModel.failed.docPassRate).toBe(0);
    expect(byModel.good.docPassEligible).toBe(1);
    expect(byModel.failed.docPassEligible).toBe(1);
  });
  it("keeps zero, nonzero, partial and unknown costs distinct", () => {
    const summaries = summarize([result("zero", 0), result("paid", 1), result("partial", 0), result("partial", null), result("unknown", null)]);
    const byName = Object.fromEntries(summaries.map((s) => [s.model, s]));
    expect(byName.zero.costPerDocUsd).toBe(0);
    expect(byName.paid.costPerDocUsd).toBe(1);
    expect(byName.partial.costPerDocUsd).toBeNull();
    expect(byName.partial.knownCostRuns).toBe(1);
    expect(byName.unknown.totalCostUsd).toBeNull();
    expect(summaries.findIndex((s) => s.model === "paid")).toBeLessThan(summaries.findIndex((s) => s.model === "unknown"));
  });
});

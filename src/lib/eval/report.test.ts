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
    expect(scoreEnvelope(expected, actual).find((s) => s.field === "doc_date")?.status).toBe("correct");
    expect(summarize([result("failed", null, false)])[0].docPassRate).toBe(0);
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

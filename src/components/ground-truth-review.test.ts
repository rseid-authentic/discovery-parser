import { describe, expect, it } from "vitest";
import { EnvelopeSchema, GroundTruthEnvelopeSchema } from "../lib/schema/envelope";
import { groundTruth, initialReview } from "./ground-truth-review";

const field = (value: unknown) => ({ value, confidence: 0.9, page: 1, source_text: "source" });
const envelope = EnvelopeSchema.parse({
  doc_type: field("email"), title_or_subject: field("Subject"), doc_date: field("2024-01-01"),
  author_from: field("Alex"), recipients_to: [field("Sam")], cc: [], organizations: [],
  people: [field("Alex")], bates_begin: field(null), bates_end: field(null), page_count: field(2),
  has_privilege_legend: field(false), has_redactions: field(true), language: field("en"),
  summary: "Example", overall_confidence: 0.9,
});

describe("ground-truth review export", () => {
  it("exports edited values in the evaluator schema without model confidence", () => {
    const review = initialReview(envelope);
    review.author_from = { value: "Jordan", page: "", source: "", reviewed: true };
    review.recipients_to.value = "Sam\nTaylor\n";
    const label = groundTruth(review);
    expect(GroundTruthEnvelopeSchema.safeParse(label).success).toBe(true);
    expect(label.author_from).toEqual({ value: "Jordan", page: null, source_text: null });
    expect(label.recipients_to).toEqual([{ value: "Sam" }, { value: "Taylor" }]);
    expect(label.has_privilege_legend.value).toBe(false);
    expect(label.has_redactions.value).toBe(true);
    expect(label.doc_type).not.toHaveProperty("confidence");
    expect(label._meta?.draft).not.toBe(true);
  });

  it("rejects invalid dates and page numbers", () => {
    const review = initialReview(envelope);
    review.doc_date.value = "not-a-date";
    expect(() => groundTruth(review)).toThrow();
    review.doc_date.value = "2024-01-01";
    review.page_count.page = "0";
    expect(() => groundTruth(review)).toThrow();
  });
});

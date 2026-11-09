import { describe, expect, it } from "vitest";
import { EnvelopeSchema, ExtractionEnvelopeSchema, GroundTruthEnvelopeSchema, normalizeDateUncertainty } from "../lib/schema/envelope";
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
  it("reads old runs and requires details and uncertainty for new extractions", () => {
    expect(EnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(ExtractionEnvelopeSchema.safeParse(envelope).success).toBe(false);
    const result = ExtractionEnvelopeSchema.parse({ ...envelope, doc_date: { value: null, confidence: 0, page: 1, source_text: "01/02/2003" }, date_uncertainty: "day/month order unknown", document_details: [{ label: "Grand total", value: "RM 53.00", confidence: 0.9, page: 1, source_text: "Grand Total 53.00" }] });
    expect(result.doc_date.source_text).toBe("01/02/2003");
    expect(result.document_details[0].value).toBe("RM 53.00");
    expect(EnvelopeSchema.parse(result).date_uncertainty).toBe("day/month order unknown");
  });

  it("does not keep a guessed date when the model also reports ambiguity", () => {
    const uncertain = { ...envelope, doc_date: field("2003-01-02"), date_uncertainty: "day/month order unknown" };
    const normalized = normalizeDateUncertainty(EnvelopeSchema.parse(uncertain));
    expect(normalized.doc_date).toEqual({ value: null, confidence: 0, page: 1, source_text: "source" });
    expect(normalizeDateUncertainty(envelope).doc_date.value).toBe("2024-01-01");
  });
  it("starts from a proposed draft without marking fields reviewed", () => {
    const draft = GroundTruthEnvelopeSchema.parse({ ...envelope, _meta: { draft: true }, doc_date: { value: null }, organizations: [{ value: "Corrected Inc" }] });
    const review = initialReview(envelope, draft);
    expect(review.doc_date.value).toBe("");
    expect(review.organizations.value).toBe("Corrected Inc");
    expect(Object.values(review).every((field) => !field.reviewed)).toBe(true);
    expect(initialReview(envelope).doc_date.value).toBe("2024-01-01");
  });
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

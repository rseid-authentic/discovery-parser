import { describe, expect, it } from "vitest";
import { selectRun } from "./select-run";

const field = (value: unknown) => ({ value, confidence: 0.9, page: null, source_text: null });
const output = { doc_type: field("email"), title_or_subject: field(null), doc_date: field(null), author_from: field(null), recipients_to: [], cc: [], organizations: [], people: [], bates_begin: field(null), bates_end: field(null), page_count: field(1), has_privilege_legend: field(false), has_redactions: field(false), language: field("en"), summary: "test", overall_confidence: 0.9 };

describe("selectRun", () => {
  it("uses the most recent readable success even after a failed run", () => {
    const failed = { id: "new", schemaValid: false, output: null };
    const success = { id: "old", schemaValid: true, output };
    expect(selectRun([failed, success])?.id).toBe("old");
    expect(selectRun([success, failed])?.id).toBe("old");
    expect(selectRun([failed])?.id).toBe("new");
    expect(selectRun([])).toBeUndefined();
  });
  it("does not trust a success flag on an unreadable output", () => {
    expect(selectRun([{ id: "broken", schemaValid: true, output: {} }, { id: "valid", schemaValid: true, output }])?.id).toBe("valid");
  });
});

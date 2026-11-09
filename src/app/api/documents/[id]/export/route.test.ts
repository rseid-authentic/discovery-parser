import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ doc: vi.fn(), runs: vi.fn() }));
vi.mock("@/db", () => ({ db: () => ({ query: { documents: { findFirst: mocks.doc }, extractionRuns: { findMany: mocks.runs } } }), schema: { documents: { id: "id" }, extractionRuns: { documentId: "document_id", createdAt: "created_at", id: "id" } } }));

import { GET } from "./route";

const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const f = (value: unknown) => ({ value, confidence: 0, page: null, source_text: null });
const output = { doc_type: f(null), title_or_subject: f(null), doc_date: f(null), author_from: f(null), recipients_to: [], cc: [], organizations: [], people: [], bates_begin: f(null), bates_end: f(null), page_count: f(1), has_privilege_legend: f(null), has_redactions: f(null), language: f(null), summary: "", overall_confidence: 0 };

describe("document JSON export", () => {
  beforeEach(() => {
    mocks.doc.mockResolvedValue({ id, filename: "test.pdf", sha256: "hash", pageCount: 1, hasTextLayer: false });
    mocks.runs.mockResolvedValue([
      { id: "failed", schemaValid: false, output: null },
      { id: "success", schemaValid: true, output, model: "test", inputMode: "text" },
    ]);
  });
  it("selects the earlier readable success and supports an explicit failed run", async () => {
    const request = (query = "") => new Request(`http://localhost/api/documents/${id}/export${query}`);
    const context = { params: Promise.resolve({ id }) };
    const response = await GET(request(), context);
    expect((await response.json()).run.id).toBe("success");
    const failed = await GET(request("?runId=failed"), context);
    expect((await failed.json()).run.id).toBe("failed");
    expect((await GET(request("?runId=other"), context)).status).toBe(404);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secret: vi.fn<() => string | null>(),
  analyze: vi.fn(),
  findFirst: vi.fn(),
  put: vi.fn(),
  run: vi.fn(),
  inserted: vi.fn(),
  updated: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ uploadSecret: mocks.secret }));
vi.mock("@/lib/parse/text-layer", () => ({ analyzeTextLayer: mocks.analyze }));
vi.mock("@/lib/parse/route", () => ({ runRoute: mocks.run }));
vi.mock("@/lib/storage/blob", () => ({ putObject: mocks.put, documentKey: () => "docs/test.pdf", sha256Hex: () => "hash" }));
vi.mock("@/db", () => ({ db: () => ({
  query: { documents: { findFirst: mocks.findFirst } },
  insert: () => ({ values: (value: unknown) => { mocks.inserted(value); return { returning: async () => [{ id: "new", filename: "test.pdf" }] }; } }),
  update: () => ({ set: (value: unknown) => { mocks.updated(value); return { where: async () => [] }; } }),
}), schema: { documents: { sha256: "sha", id: "id" }, extractionRuns: {} } }));

import { POST } from "./route";

function request(token: string): Request {
  const form = new FormData();
  form.set("access_token", token);
  form.set("file", new File(["pdf"], "test.pdf", { type: "application/pdf" }));
  return new Request("http://localhost/api/upload", { method: "POST", body: form });
}

describe("upload boundary", () => {
  const token = "x".repeat(40);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.secret.mockReturnValue(token);
    mocks.analyze.mockResolvedValue({ pageCount: 1, pages: ["text"], text: "text", hasTextLayer: true });
  });

  it("fails closed without a configured secret", async () => {
    mocks.secret.mockReturnValue(null);
    expect((await POST(request(token))).status).toBe(503);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("rejects unauthorized and over-page-limit requests before storage or model calls", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(mocks.analyze).not.toHaveBeenCalled();
    mocks.analyze.mockResolvedValue({ pageCount: 26 });
    expect((await POST(request(token))).status).toBe(413);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("checks the token before redirecting a duplicate and avoids another model call", async () => {
    mocks.findFirst.mockResolvedValue({ id: "existing" });
    expect((await POST(request("wrong"))).status).toBe(401);
    const response = await POST(request(token));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/documents/existing");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("accepts an authorized upload after checking page count", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.put.mockResolvedValue({ url: "https://example.test/file.pdf" });
    mocks.run.mockResolvedValue({ plan: { model: "test", inputMode: "text" }, result: { schemaValid: true, envelope: {}, usage: {}, costUsd: 0, latencyMs: 1, promptVersion: "test" } });
    const response = await POST(request(token));
    expect(response.status).toBe(303);
    expect(mocks.analyze.mock.invocationCallOrder[0]).toBeLessThan(mocks.put.mock.invocationCallOrder[0]);
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.run).toHaveBeenCalledOnce();
    expect(mocks.updated).toHaveBeenCalledWith(expect.objectContaining({ status: "parsed" }));
  });

  it("preserves extracted text when model processing throws", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.put.mockResolvedValue({ url: "https://example.test/file.pdf" });
    mocks.run.mockRejectedValue(new Error("provider unavailable"));
    expect((await POST(request(token))).status).toBe(303);
    expect(mocks.inserted).toHaveBeenLastCalledWith(expect.objectContaining({ schemaValid: false, output: { extracted_text: { source: "pdf-text-layer", text: "text" } } }));
    expect(mocks.updated).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});

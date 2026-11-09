import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextLayerAnalysis } from "./text-layer";

vi.mock("@/lib/env", () => ({ openrouterEnv: () => ({ DEFAULT_TEXT_MODEL: "text-model", DEFAULT_VISION_MODEL: "pdf-model" }) }));
vi.mock("./extract", () => ({ extractEnvelope: vi.fn() }));

import { planRoute, runRoute } from "./route";
import { extractEnvelope } from "./extract";
import { EnvelopeSchema } from "../schema/envelope";

function analysis(pages: string[]): TextLayerAnalysis {
  const ratio = pages.filter((p) => p.replace(/\s/g, "").length >= 50).length / pages.length;
  return { pageCount: pages.length, pages, text: pages.map((p, i) => `=== Page ${i + 1} ===\n${p}`).join("\n\n"), avgCharsPerPage: pages.join("").length / pages.length, textPageRatio: ratio, hasTextLayer: ratio >= 0.5 };
}

describe("document routing", () => {
  beforeEach(() => vi.mocked(extractEnvelope).mockReset());
  it("routes clean text to text and scans, mixed and blank pages to PDF", () => {
    expect(planRoute(analysis(["a".repeat(60), "b".repeat(60)])).inputMode).toBe("text");
    for (const pages of [["", ""], ["a".repeat(60), ""], ["a".repeat(60), "  "]]) {
      expect(planRoute(analysis(pages)).inputMode).toBe("pdf");
    }
  });
  it("honors forced modes and preserves ordered text input", async () => {
    const mixed = analysis(["first ".repeat(10), ""]);
    expect(planRoute(mixed, { mode: "text" }).inputMode).toBe("text");
    expect(planRoute(analysis(["a".repeat(60)]), { mode: "pdf", pdfEngine: "native" }).pdfEngine).toBe("native");
    vi.mocked(extractEnvelope).mockResolvedValue({ envelope: null, raw: "", schemaValid: false, usage: { inputTokens: undefined, outputTokens: undefined }, costUsd: null, latencyMs: 0, attempts: 1, promptVersion: "test" });
    await runRoute(new Uint8Array([1]), "a.pdf", { mode: "text" }, mixed);
    expect(vi.mocked(extractEnvelope).mock.calls[0][0].source).toEqual({ kind: "text", text: mixed.text });
    expect(mixed.text.indexOf("Page 1")).toBeLessThan(mixed.text.indexOf("Page 2"));
  });
  it("keeps a mixed PDF's original text separately from OCR", async () => {
    const f = (value: unknown) => ({ value, confidence: 0, page: null, source_text: null });
    const envelope = EnvelopeSchema.parse({ doc_type: f(null), title_or_subject: f(null), doc_date: f(null), author_from: f(null), recipients_to: [], cc: [], organizations: [], people: [], bates_begin: f(null), bates_end: f(null), page_count: f(2), has_privilege_legend: f(null), has_redactions: f(null), language: f(null), summary: "", overall_confidence: 0, extracted_text: { source: "openrouter-file-parser", text: "OCR" } });
    vi.mocked(extractEnvelope).mockResolvedValue({ envelope, raw: "", schemaValid: true, usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, latencyMs: 1, attempts: 1, promptVersion: "test" });
    const mixed = analysis(["a".repeat(60), ""]);
    const result = await runRoute(new Uint8Array([1]), "a.pdf", {}, mixed);
    expect(result.plan.inputMode).toBe("pdf");
    expect(result.result.envelope?.extracted_text?.text).toBe("OCR");
    expect(result.result.envelope?.source_text_layer?.text).toBe(mixed.text);
  });
});

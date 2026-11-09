import { describe, expect, it } from "vitest";
import { routeLabel } from "./route-label";

describe("route label", () => {
  it("distinguishes text, requested PDF engines, and provider default", () => {
    expect(routeLabel({ model: "model", inputMode: "text", pdfEngine: null })).toBe("Text layer → text input");
    expect(routeLabel({ model: "model", inputMode: "pdf", pdfEngine: null })).toContain("actual engine unknown");
    for (const engine of ["native", "mistral-ocr", "cloudflare-ai"]) {
      expect(routeLabel({ model: "model", inputMode: "pdf", pdfEngine: engine })).toBe(`PDF input · requested engine: ${engine}`);
    }
    expect(routeLabel({ model: "model", inputMode: "pdf", pdfEngine: "pdf-text" })).toContain("deprecated");
  });

  it("does not mislabel a failure placeholder as text processing", () => {
    expect(routeLabel({ model: "unknown", inputMode: "text", pdfEngine: null })).toContain("Route unknown");
  });
});

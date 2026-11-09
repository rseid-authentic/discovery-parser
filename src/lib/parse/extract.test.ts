import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openrouter", () => ({ openrouter: () => ({ chat: () => ({}) }) }));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(async (options: { onEnd: (event: unknown) => void }) => {
      options.onEnd({ providerMetadata: { openrouter: { annotations: [{ type: "file", file: { content: [{ type: "text", text: "OCR text" }] } }], usage: { cost: 0.002 } } } });
      throw new actual.NoObjectGeneratedError({ text: "not json", response: { id: "test", timestamp: new Date(), modelId: "test" }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 }, outputTokenDetails: { textTokens: 1, reasoningTokens: 0 } }, finishReason: "stop" });
    }),
  };
});

import { extractEnvelope } from "./extract";

describe("OCR on invalid structured output", () => {
  it("retains provider text and reported cost without another request", async () => {
    const result = await extractEnvelope({ model: "test", pdfEngine: "mistral-ocr", source: { kind: "pdf", bytes: new Uint8Array([1]) } });
    expect(result.schemaValid).toBe(false);
    expect(result.envelope).toBeNull();
    expect(result.extractedText).toEqual({ source: "openrouter-file-parser", text: "OCR text" });
    expect(result.costUsd).toBe(0.002);
    expect(result.attempts).toBe(1);
  });
});

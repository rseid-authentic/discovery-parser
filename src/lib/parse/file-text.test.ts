import { describe, expect, it } from "vitest";
import { parsedFileText } from "./file-text";

describe("provider parsed text", () => {
  it("preserves text in order and excludes image data", () => {
    const metadata = { openrouter: { annotations: [{ type: "file", file: { content: [
      { type: "text", text: "Page one\nline two" },
      { type: "image_url", image_url: { url: "data:image/png;base64,secret" } },
      { type: "text", text: "Page two" },
    ] } }] } };
    expect(parsedFileText(metadata)).toBe("Page one\nline two\n\nPage two");
  });
  it("treats missing or empty annotations as unavailable, not an empty document", () => {
    expect(parsedFileText(undefined)).toBeUndefined();
    expect(parsedFileText({ openrouter: { annotations: [{ type: "file", file: { content: [{ type: "text", text: " " }] } }] } })).toBeUndefined();
  });
});

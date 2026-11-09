import { z } from "zod";

/** Extract text parts only; annotations may be missing and can include large images. */
export function parsedFileText(metadata: unknown): string | undefined {
  const parsed = z.object({ openrouter: z.object({ annotations: z.array(z.object({
    type: z.string(), file: z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() }).optional(),
  })).optional() }).optional() }).safeParse(metadata);
  if (!parsed.success) return undefined;
  const parts = (parsed.data.openrouter?.annotations ?? []).filter((item) => item.type === "file").flatMap((item) => item.file?.content ?? []).filter((item) => item.type === "text" && item.text?.trim()).map((item) => item.text!);
  return parts.length ? parts.join("\n\n") : undefined;
}

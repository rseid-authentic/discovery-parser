import { generateText, NoObjectGeneratedError, Output, type ModelMessage } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/openrouter";
import { estimateCost, type Usage } from "@/lib/models";
import { ExtractionEnvelopeSchema, normalizeDateUncertainty, type Envelope, type ExtractedText } from "@/lib/schema/envelope";
import { parsedFileText } from "./file-text";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  USER_PROMPT_FOR_PDF,
  repairPrompt,
  userPromptForText,
} from "./prompt";

export type PdfEngine = "native" | "mistral-ocr" | "cloudflare-ai" | "pdf-text";

export type ExtractSource =
  | { kind: "text"; text: string }
  | { kind: "pdf"; bytes: Uint8Array; filename?: string };

export type ExtractOptions = {
  source: ExtractSource;
  /** OpenRouter model id. */
  model: string;
  /** Only used when source.kind === "pdf". Omit to let OpenRouter pick (native if supported, else mistral-ocr). */
  pdfEngine?: PdfEngine;
  /** Number of repair attempts after a schema failure. Default 0 for parser-backed PDFs, otherwise 1. */
  maxRepairs?: number;
};

export type ExtractResult = {
  envelope: Envelope | null;
  extractedText?: ExtractedText;
  /** Raw model text of the final attempt (valid JSON or not). */
  raw: string;
  schemaValid: boolean;
  zodError?: string;
  usage: Usage;
  costUsd: number | null;
  latencyMs: number;
  attempts: number;
  promptVersion: string;
};

type Attempt = {
  text: string;
  envelope: Envelope | null;
  zodIssues: string | null;
  usage: Usage;
  parsedText?: string;
};

/**
 * One structured-output call plus at most `maxRepairs` bounded repair calls
 * that feed Zod issues back to the model. No escalation to another model here:
 * that is the v1 cascade (see route.ts).
 */
export async function extractEnvelope(opts: ExtractOptions): Promise<ExtractResult> {
  const started = Date.now();
  // Repeating an OCR request would process and charge for the PDF again.
  const maxRepairs = opts.maxRepairs ?? (opts.source.kind === "pdf" && opts.pdfEngine !== "native" ? 0 : 1);

  const model = openrouter().chat(opts.model, {
    usage: { include: true },
    plugins:
      opts.source.kind === "pdf" && opts.pdfEngine
        ? [{ id: "file-parser", pdf: { engine: opts.pdfEngine } }]
        : undefined,
  });

  const messages: ModelMessage[] = [initialUserMessage(opts.source)];
  const usageTotal: Usage = { inputTokens: 0, outputTokens: 0, reportedCostUsd: undefined };
  let last: Attempt | undefined;
  let attempts = 0;
  let parsedText: string | undefined;
  let allCostsReported = true;

  for (let i = 0; i <= maxRepairs; i++) {
    attempts++;
    last = await attemptOnce(model, messages, opts.source.kind === "pdf" && opts.pdfEngine !== "native" ? 0 : 2);
    parsedText ??= last.parsedText;
    if (last.usage.reportedCostUsd === undefined) allCostsReported = false;
    addUsage(usageTotal, last.usage);
    if (last.envelope) break;
    if (i < maxRepairs) {
      messages.push({ role: "assistant", content: last.text });
      messages.push({ role: "user", content: repairPrompt(last.zodIssues ?? "Output was not valid JSON.") });
    }
  }

  // `last` is always set: the loop runs at least once.
  const final = last as Attempt;
  if (!allCostsReported) usageTotal.reportedCostUsd = undefined;
  const extractedText: ExtractedText | undefined = opts.source.kind === "text"
    ? { source: "pdf-text-layer", text: opts.source.text }
    : parsedText ? { source: "openrouter-file-parser", text: parsedText } : undefined;
  return {
    envelope: final.envelope ? { ...final.envelope, ...(extractedText ? { extracted_text: extractedText } : {}) } : null,
    extractedText,
    raw: final.text,
    schemaValid: final.envelope !== null,
    zodError: final.zodIssues ?? undefined,
    usage: usageTotal,
    // Token-only estimates omit OCR per-page fees, so do not report an incomplete total.
    costUsd: opts.source.kind === "pdf" && opts.pdfEngine !== "native" && !allCostsReported ? null : estimateCost(usageTotal, opts.model),
    latencyMs: Date.now() - started,
    attempts,
    promptVersion: PROMPT_VERSION,
  };
}

function initialUserMessage(source: ExtractSource): ModelMessage {
  if (source.kind === "text") {
    return { role: "user", content: userPromptForText(source.text) };
  }
  return {
    role: "user",
    content: [
      { type: "text", text: USER_PROMPT_FOR_PDF },
      {
        type: "file",
        mediaType: "application/pdf",
        data: source.bytes,
        filename: source.filename ?? "document.pdf",
      },
    ],
  };
}

async function attemptOnce(
  model: ReturnType<ReturnType<typeof openrouter>["chat"]>,
  messages: ModelMessage[],
  maxRetries: number,
): Promise<Attempt> {
  let parsedText: string | undefined;
  let providerMetadata: unknown;
  try {
    const result = await generateText({
      model,
      instructions: SYSTEM_PROMPT,
      messages,
      output: Output.object({ schema: ExtractionEnvelopeSchema, name: "envelope" }),
      onEnd: (event) => {
        providerMetadata = event.providerMetadata;
        parsedText = parsedFileText(providerMetadata);
      },
      temperature: 0,
      maxRetries, // Avoid repeating a potentially charged parser-backed PDF request.
    });
    parsedText = parsedFileText(result.finalStep.providerMetadata);
    return {
      text: result.text,
      envelope: normalizeDateUncertainty(result.output),
      parsedText,
      zodIssues: null,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        reportedCostUsd: openrouterCost(result.finalStep.providerMetadata),
      },
    };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      // Model answered but the JSON failed to parse/validate. Recover the raw text
      // and compute precise Zod issues to feed back.
      const text = err.text ?? "";
      return {
        text,
        envelope: null,
        zodIssues: describeZodIssues(text),
        parsedText,
        usage: {
          inputTokens: err.usage?.inputTokens,
          outputTokens: err.usage?.outputTokens,
          reportedCostUsd: openrouterCost(providerMetadata),
        },
      };
    }
    throw err;
  }
}


function describeZodIssues(text: string): string {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(text));
  } catch {
    return "Response was not parseable JSON.";
  }
  const parsed = ExtractionEnvelopeSchema.safeParse(json);
  if (parsed.success) return "Validation passed on re-parse (SDK rejected it).";
  return z.prettifyError(parsed.error);
}

function stripCodeFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

function addUsage(total: Usage, u: Usage) {
  total.inputTokens = (total.inputTokens ?? 0) + (u.inputTokens ?? 0);
  total.outputTokens = (total.outputTokens ?? 0) + (u.outputTokens ?? 0);
  if (typeof u.reportedCostUsd === "number") {
    total.reportedCostUsd = (total.reportedCostUsd ?? 0) + u.reportedCostUsd;
  }
}

/** Reads `providerMetadata.openrouter.usage.cost` (requires `usage: { include: true }`). */
function openrouterCost(meta: unknown): number | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const or = (meta as Record<string, unknown>).openrouter;
  if (!or || typeof or !== "object") return undefined;
  const usage = (or as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return undefined;
  const cost = (usage as Record<string, unknown>).cost;
  return typeof cost === "number" ? cost : undefined;
}

import { generateText, NoObjectGeneratedError, Output, type ModelMessage } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/openrouter";
import { estimateCost, type Usage } from "@/lib/models";
import { EnvelopeSchema, type Envelope } from "@/lib/schema/envelope";
import {
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  USER_PROMPT_FOR_PDF,
  repairPrompt,
  userPromptForText,
} from "./prompt";

export type PdfEngine = "native" | "mistral-ocr" | "pdf-text";

export type ExtractSource =
  | { kind: "text"; text: string }
  | { kind: "pdf"; bytes: Uint8Array; filename?: string };

export type ExtractOptions = {
  source: ExtractSource;
  /** OpenRouter model id. */
  model: string;
  /** Only used when source.kind === "pdf". Omit to let OpenRouter pick (native if supported, else mistral-ocr). */
  pdfEngine?: PdfEngine;
  /** Number of repair attempts after a schema failure. Default 1. */
  maxRepairs?: number;
};

export type ExtractResult = {
  envelope: Envelope | null;
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
};

/**
 * One structured-output call plus at most `maxRepairs` bounded repair calls
 * that feed Zod issues back to the model. No escalation to another model here:
 * that is the v1 cascade (see route.ts).
 */
export async function extractEnvelope(opts: ExtractOptions): Promise<ExtractResult> {
  const started = Date.now();
  const maxRepairs = opts.maxRepairs ?? 1;

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

  for (let i = 0; i <= maxRepairs; i++) {
    attempts++;
    last = await attemptOnce(model, messages);
    addUsage(usageTotal, last.usage);
    if (last.envelope) break;
    if (i < maxRepairs) {
      messages.push({ role: "assistant", content: last.text });
      messages.push({ role: "user", content: repairPrompt(last.zodIssues ?? "Output was not valid JSON.") });
    }
  }

  // `last` is always set: the loop runs at least once.
  const final = last as Attempt;
  return {
    envelope: final.envelope,
    raw: final.text,
    schemaValid: final.envelope !== null,
    zodError: final.zodIssues ?? undefined,
    usage: usageTotal,
    costUsd: estimateCost(usageTotal, opts.model),
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
): Promise<Attempt> {
  try {
    const result = await generateText({
      model,
      instructions: SYSTEM_PROMPT,
      messages,
      output: Output.object({ schema: EnvelopeSchema, name: "envelope" }),
      temperature: 0,
      maxRetries: 2, // transient HTTP errors only; the SDK does not retry 4xx
    });
    return {
      text: result.text,
      envelope: result.output,
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
        usage: {
          inputTokens: err.usage?.inputTokens,
          outputTokens: err.usage?.outputTokens,
          // providerMetadata is not available on the error; cost falls back to list price.
          reportedCostUsd: undefined,
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
  const parsed = EnvelopeSchema.safeParse(json);
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

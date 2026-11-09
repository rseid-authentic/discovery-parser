import { openrouterEnv } from "@/lib/env";
import { extractEnvelope, type ExtractResult, type PdfEngine } from "./extract";
import { analyzeTextLayer, type TextLayerAnalysis } from "./text-layer";

export type InputMode = "text" | "pdf";

export type RouteOptions = {
  /** "auto" routes on the text layer; "text"/"pdf" force a mode. Default "auto". */
  mode?: "auto" | InputMode;
  /** Override the model chosen from DEFAULT_TEXT_MODEL / DEFAULT_VISION_MODEL. */
  model?: string;
  /** PDF engine for pdf mode. Defaults to OCR so parsed text can be retained. */
  pdfEngine?: PdfEngine;
};

export type RoutePlan = {
  inputMode: InputMode;
  model: string;
  pdfEngine: PdfEngine | undefined;
  reason: string;
};

/**
 * v0 routing rule, deterministic and tiny:
 *   usable text layer  -> send extracted text to the cheap text model
 *   otherwise (scan)   -> send the PDF itself to the vision model
 */
export function planRoute(textLayer: TextLayerAnalysis, opts: RouteOptions = {}): RoutePlan {
  const env = openrouterEnv();
  const mode: InputMode =
    opts.mode && opts.mode !== "auto" ? opts.mode : textLayer.hasTextLayer && textLayer.textPageRatio === 1 ? "text" : "pdf";

  if (mode === "text") {
    return {
      inputMode: "text",
      model: opts.model ?? env.DEFAULT_TEXT_MODEL,
      pdfEngine: undefined,
      reason:
        opts.mode === "text"
          ? "forced text mode"
          : `text layer detected (${textLayer.avgCharsPerPage.toFixed(0)} chars/page avg)`,
    };
  }
  return {
    inputMode: "pdf",
    model: opts.model ?? env.DEFAULT_VISION_MODEL,
    pdfEngine: opts.pdfEngine ?? "mistral-ocr",
    reason:
      opts.mode === "pdf"
        ? "forced pdf mode"
        : `incomplete or insufficient text layer (${textLayer.textPageRatio * 100}% of pages meet the text threshold)`,
  };
}

export type RouteResult = {
  textLayer: TextLayerAnalysis;
  plan: RoutePlan;
  result: ExtractResult;
};

/** Analyze -> plan -> extract. This is the whole v0 ingest path after storage. */
export async function runRoute(bytes: Uint8Array, filename: string, opts: RouteOptions = {}, analysis?: TextLayerAnalysis): Promise<RouteResult> {
  const textLayer = analysis ?? await analyzeTextLayer(bytes);
  const plan = planRoute(textLayer, opts);
  const result = await extractEnvelope({
    model: plan.model,
    pdfEngine: plan.pdfEngine,
    source:
      plan.inputMode === "text" ? { kind: "text", text: textLayer.text } : { kind: "pdf", bytes, filename },
  });

  // A mixed PDF's existing text remains a separate candidate; it may be incomplete.
  if (plan.inputMode === "pdf" && result.envelope && textLayer.pages.some((page) => page.trim())) {
    result.envelope.source_text_layer = { source: "pdf-text-layer", text: textLayer.text };
  }

  // TODO(v1) cascade: escalate to a stronger model when
  //   - result.schemaValid === false after the bounded repair, or
  //   - any CRITICAL field's confidence < threshold (user chooses thresholds), or
  //   - cross-checks fail (e.g. page_count.value !== textLayer.pageCount).
  //   Each tier is its own extraction_run row so cost per tier is reportable.
  // TODO(v1) queue: this function is called synchronously from the upload route in v0;
  //   the BullMQ worker calls it instead in v1.

  return { textLayer, plan, result };
}

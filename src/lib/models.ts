/**
 * OpenRouter model registry.
 *
 * Prices are USD per million tokens and were read from
 * https://openrouter.ai/api/v1/models/<id>/endpoints on 2026-11-08 (standard,
 * non-flex endpoint). Prices move weekly: re-verify before quoting them in the
 * README, and prefer the OpenRouter-reported `cost` on each response (see
 * `estimateCost`) over these numbers.
 */

export type ModelTier = "cheap" | "mid" | "frontier";

export type ModelInfo = {
  /** OpenRouter model id, e.g. `google/gemini-2.5-flash-lite`. */
  id: string;
  label: string;
  /** Accepts image/file input (can take the PDF directly). */
  vision: boolean;
  /**
   * Accepts `file` input natively on OpenRouter. If false but `vision` is true,
   * PDFs must go through the `file-parser` plugin with `mistral-ocr` (or the
   * free `cloudflare-ai`) engine, which rasterises/OCRs server-side.
   */
  nativePdf: boolean;
  tier: ModelTier;
  priceInPerM: number;
  priceOutPerM: number;
  notes: string;
};

export const MODELS: readonly ModelInfo[] = [
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    vision: true,
    nativePdf: true,
    tier: "cheap",
    priceInPerM: 0.1,
    priceOutPerM: 0.4,
    notes: "Default text + vision model. Verified 2026-11-08.",
  },
  {
    id: "google/gemini-3-flash-preview",
    label: "Gemini 3 Flash (preview)",
    vision: true,
    nativePdf: true,
    tier: "cheap",
    priceInPerM: 0.5,
    priceOutPerM: 3.0,
    notes: "ParseBench ~0.65c/page. Preview id may change. Verified 2026-11-08.",
  },
  {
    id: "qwen/qwen3-vl-8b-instruct",
    label: "Qwen3-VL-8B Instruct",
    vision: true,
    nativePdf: false,
    tier: "cheap",
    priceInPerM: 0.25,
    priceOutPerM: 0.75,
    notes:
      "Image-only input on OpenRouter: use --engine mistral-ocr for PDFs. Single provider (Parasail). Verified 2026-11-08.",
  },
  {
    id: "openai/gpt-5-mini",
    label: "GPT-5 Mini",
    vision: true,
    nativePdf: true,
    tier: "mid",
    priceInPerM: 0.25,
    priceOutPerM: 2.0,
    notes: "ParseBench ~0.88c/page. Verified 2026-11-08.",
  },
  {
    id: "anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
    vision: true,
    nativePdf: true,
    tier: "mid",
    priceInPerM: 0.1,
    priceOutPerM: 0.5,
    notes: "Verified 2026-11-08 (first listed endpoint). Re-check: unusually cheap for Haiku.",
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    vision: true,
    nativePdf: true,
    tier: "frontier",
    priceInPerM: 2.0,
    priceOutPerM: 10.0,
    notes: "Frontier reference; used by `pnpm eval:bootstrap` to draft labels. Verified 2026-11-08.",
  },
];

export function getModel(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id);
}

export function requireModel(id: string): ModelInfo {
  const m = getModel(id);
  if (!m) {
    throw new Error(`Unknown model "${id}". Known: ${MODELS.map((x) => x.id).join(", ")}`);
  }
  return m;
}

export type Usage = {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  /** Cost in USD as reported by OpenRouter usage accounting, when present. */
  reportedCostUsd?: number | undefined;
};

/**
 * Cost in USD. Prefers OpenRouter's reported cost (covers OCR plugin fees and
 * provider-specific pricing); falls back to list price x tokens; returns null
 * when nothing is known.
 */
export function estimateCost(usage: Usage, model: ModelInfo | string): number | null {
  if (typeof usage.reportedCostUsd === "number" && Number.isFinite(usage.reportedCostUsd)) {
    return usage.reportedCostUsd;
  }
  const info = typeof model === "string" ? getModel(model) : model;
  if (!info) return null;
  const inTok = usage.inputTokens ?? 0;
  const outTok = usage.outputTokens ?? 0;
  if (inTok === 0 && outTok === 0) return null;
  return (inTok * info.priceInPerM + outTok * info.priceOutPerM) / 1_000_000;
}

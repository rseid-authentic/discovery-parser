import { extractText } from "unpdf";

export type TextLayerAnalysis = {
  pageCount: number;
  /** Per-page extracted text (empty strings for image-only pages). */
  pages: string[];
  /** All pages joined with form-feed separators and page markers. */
  text: string;
  /** Average non-whitespace characters per page. */
  avgCharsPerPage: number;
  /** Fraction of pages with at least MIN_CHARS_PER_PAGE non-whitespace chars. */
  textPageRatio: number;
  hasTextLayer: boolean;
};

/** Heuristic thresholds. Tune against the sample set; see SPEC.md "Routing rules". */
export const MIN_AVG_CHARS_PER_PAGE = 50;
export const MIN_TEXT_PAGE_RATIO = 0.5;

/**
 * Detects whether a PDF has a usable text layer and extracts it.
 * Uses unpdf's serverless pdf.js build: no native deps, works on Vercel.
 */
export async function analyzeTextLayer(bytes: Uint8Array): Promise<TextLayerAnalysis> {
  // pdf.js may transfer/detach the buffer it is given; hand it a copy.
  const { totalPages, text } = await extractText(new Uint8Array(bytes), { mergePages: false });
  const pages = text.map((p) => p.trim());
  const counts = pages.map((p) => p.replace(/\s/g, "").length);
  const total = counts.reduce((a, b) => a + b, 0);
  const avgCharsPerPage = totalPages > 0 ? total / totalPages : 0;
  const textPages = counts.filter((c) => c >= MIN_AVG_CHARS_PER_PAGE).length;
  const textPageRatio = totalPages > 0 ? textPages / totalPages : 0;

  return {
    pageCount: totalPages,
    pages,
    text: pages.map((p, i) => `=== Page ${i + 1} ===\n${p}`).join("\n\n"),
    avgCharsPerPage,
    textPageRatio,
    hasTextLayer: avgCharsPerPage >= MIN_AVG_CHARS_PER_PAGE && textPageRatio >= MIN_TEXT_PAGE_RATIO,
  };
}

/** A requested engine is not proof of how the provider actually processed a PDF. */
export function routeLabel(run: { model: string; inputMode: "text" | "pdf"; pdfEngine: string | null }): string {
  if (run.model === "unknown") return "Route unknown (processing failed)";
  if (run.inputMode === "text") return "Text layer → text input";
  if (!run.pdfEngine) return "PDF input · provider default (actual engine unknown)";
  if (run.pdfEngine === "pdf-text") return "PDF input · requested engine: pdf-text (deprecated; provider redirects)";
  return `PDF input · requested engine: ${run.pdfEngine}`;
}

import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { EnvelopeSchema, ExtractedTextSchema } from "@/lib/schema/envelope";
import { analyzeTextLayer } from "@/lib/parse/text-layer";
import { sha256Hex } from "@/lib/storage/blob";
import { selectRun } from "@/lib/parse/select-run";

/** Public, like the existing document viewer and Blob URLs. No new model call. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "invalid document id" }, { status: 400 });
  const doc = await db().query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) return Response.json({ error: "document not found" }, { status: 404 });
  const runs = await db().query.extractionRuns.findMany({ where: eq(schema.extractionRuns.documentId, id), orderBy: [desc(schema.extractionRuns.createdAt), desc(schema.extractionRuns.id)] });
  const requested = new URL(request.url).searchParams.get("runId");
  const run = requested ? runs.find((item) => item.id === requested) : selectRun(runs);
  if (!run) return Response.json({ error: "no extraction run available" }, { status: 404 });
  const parsed = run?.schemaValid ? EnvelopeSchema.safeParse(run.output) : null;
  let extraction = parsed?.success ? parsed.data : null;
  const failedText = run.output && typeof run.output === "object" && "extracted_text" in run.output ? ExtractedTextSchema.safeParse(run.output.extracted_text) : null;
  const failedSource = run.output && typeof run.output === "object" && "source_text_layer" in run.output ? ExtractedTextSchema.safeParse(run.output.source_text_layer) : null;
  let extractedText = extraction?.extracted_text ?? (failedText?.success ? failedText.data : failedSource?.success ? failedSource.data : undefined);
  // Older text-layer runs predate text retention. Re-read only our public Blob,
  // validate its identity and size, and never call an external model for this.
  if (!extractedText && doc.hasTextLayer && doc.publicUrl && doc.bytes <= 32 * 1024 * 1024) {
    try {
      const url = new URL(doc.publicUrl);
      if (url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com")) {
        const response = await fetch(url, { redirect: "error", cache: "no-store" });
        const length = Number(response.headers.get("content-length"));
        if (response.ok && length > 0 && length === doc.bytes) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length === doc.bytes && sha256Hex(bytes) === doc.sha256) {
            const text = await analyzeTextLayer(bytes);
            if (text.hasTextLayer) extractedText = { source: "pdf-text-layer", text: text.text };
          }
        }
      }
    } catch {
      // Keep the old run usable; text is explicitly unavailable if the read fails.
    }
  }
  if (extraction && extractedText) extraction = { ...extraction, extracted_text: extractedText };
  const sourceTextLayer = extraction?.source_text_layer ?? (failedSource?.success ? failedSource.data : undefined);
  return Response.json({ document: { id: doc.id, filename: doc.filename, sha256: doc.sha256, pageCount: doc.pageCount }, run: { id: run.id, model: run.model, inputMode: run.inputMode, requestedPdfEngine: run.pdfEngine, promptVersion: run.promptVersion, schemaValid: run.schemaValid }, textAvailable: Boolean(extractedText), extractedText: extractedText ?? null, sourceTextLayer: sourceTextLayer ?? null, extraction }, { headers: { "Cache-Control": "no-store" } });
}

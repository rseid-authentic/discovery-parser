import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { runRoute } from "@/lib/parse/route";
import { documentKey, putObject, sha256Hex } from "@/lib/storage/blob";
import { uploadSecret } from "@/lib/env";
import { timingSafeEqual } from "node:crypto";
import { analyzeTextLayer } from "@/lib/parse/text-layer";

export const maxDuration = 300; // seconds; Vercel function limit for the synchronous v0 parse

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PAGES = 25;

/**
 * v0 ingest, fully synchronous:
 *   multipart -> sha256 -> Blob (content-addressed) -> documents row
 *   -> text-layer detection + routed extraction -> extraction_runs row -> update status
 *   -> 303 redirect to the viewer.
 *
 * v1: enqueue instead. After the documents row is inserted with status "queued",
 * push { documentId } onto a BullMQ queue and return immediately; the worker calls
 * runRoute() and writes the extraction_run. See SPEC.md "v1".
 */
export async function POST(request: Request) {
  const secret = uploadSecret();
  if (!secret) return Response.json({ error: "uploads are disabled" }, { status: 503 });
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_BYTES + 128 * 1024) return Response.json({ error: "request too large" }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "expected multipart form data with a PDF file" }, { status: 400 });
  }
  const token = form.get("access_token");
  const provided = typeof token === "string" ? Buffer.from(token) : Buffer.alloc(0);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing `file` field" }, { status: 400 });
  }
  if (file.type && file.type !== "application/pdf") {
    return Response.json({ error: `unsupported type ${file.type}; PDF only in v0` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: `file too large (${file.size} bytes > ${MAX_BYTES})` }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let textLayer;
  try {
    textLayer = await analyzeTextLayer(bytes);
  } catch {
    return Response.json({ error: "could not read PDF" }, { status: 400 });
  }
  if (textLayer.pageCount < 1 || textLayer.pageCount > MAX_PAGES) {
    return Response.json({ error: `PDF must contain 1–${MAX_PAGES} pages` }, { status: 413 });
  }
  const sha = sha256Hex(bytes);
  const key = documentKey(sha);

  // Identical content -> same key, same row. Re-uploading just opens the existing viewer.
  const existing = await db().query.documents.findFirst({ where: eq(schema.documents.sha256, sha) });
  if (existing && existing.publicUrl && existing.status !== "queued") {
    return redirectTo(request, `/documents/${existing.id}`);
  }

  const { url } = await putObject({ key, body: bytes, contentType: "application/pdf" });

  let doc;
  if (existing) {
    if (existing.status !== "queued") {
      await db().update(schema.documents).set({ publicUrl: url, storageKey: key }).where(eq(schema.documents.id, existing.id));
      return redirectTo(request, `/documents/${existing.id}`);
    }
    [doc] = await db().update(schema.documents).set({ publicUrl: url, storageKey: key, status: "parsing" }).where(and(eq(schema.documents.id, existing.id), eq(schema.documents.status, "queued"))).returning();
    if (!doc) return redirectTo(request, `/documents/${existing.id}`);
  } else {
  [doc] = await db()
    .insert(schema.documents)
    .values({
      filename: file.name || "upload.pdf",
      storageKey: key,
      publicUrl: url,
      mime: "application/pdf",
      bytes: bytes.byteLength,
      sha256: sha,
      status: "parsing",
    })
    .returning();
  }

  try {
    const { plan, result } = await runRoute(bytes, doc.filename, {}, textLayer);

    await db()
      .insert(schema.extractionRuns)
      .values({
        documentId: doc.id,
        model: plan.model,
        inputMode: plan.inputMode,
        pdfEngine: plan.pdfEngine ?? null,
        promptVersion: result.promptVersion,
        output: result.envelope ?? { raw_output: safeJson(result.raw), ...(result.extractedText ? { extracted_text: result.extractedText } : {}), ...(textLayer.pages.some((page) => page.trim()) ? { source_text_layer: { source: "pdf-text-layer", text: textLayer.text } } : {}) },
        schemaValid: result.schemaValid,
        error: result.zodError ?? null,
        inputTokens: result.usage.inputTokens ?? null,
        outputTokens: result.usage.outputTokens ?? null,
        costUsd: result.costUsd?.toFixed(8) ?? null,
        latencyMs: result.latencyMs,
      });

    await db()
      .update(schema.documents)
      .set({
        pageCount: textLayer.pageCount,
        hasTextLayer: textLayer.hasTextLayer,
        status: result.schemaValid ? "parsed" : "failed",
      })
      .where(eq(schema.documents.id, doc.id));
  } catch (err) {
    console.error("Document processing failed", err);
    await db()
      .insert(schema.extractionRuns)
      .values({
        documentId: doc.id,
        model: "unknown",
        inputMode: "text",
        promptVersion: "n/a",
        schemaValid: false,
        error: "Document processing failed. Please try again later.",
        output: textLayer.pages.some((page) => page.trim()) ? { extracted_text: { source: "pdf-text-layer", text: textLayer.text } } : null,
      });
    await db().update(schema.documents).set({ status: "failed", pageCount: textLayer.pageCount, hasTextLayer: textLayer.hasTextLayer }).where(eq(schema.documents.id, doc.id));
  }

  return redirectTo(request, `/documents/${doc.id}`);
}

function redirectTo(request: Request, path: string): Response {
  return Response.redirect(new URL(path, request.url), 303);
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { runRoute } from "@/lib/parse/route";
import { documentKey, putObject, sha256Hex } from "@/lib/storage/r2";

export const maxDuration = 300; // seconds; Vercel function limit for the synchronous v0 parse

const MAX_BYTES = 25 * 1024 * 1024;

/**
 * v0 ingest, fully synchronous:
 *   multipart -> sha256 -> R2 (immutable, content-addressed) -> documents row
 *   -> text-layer detection + routed extraction -> extraction_runs row -> update status
 *   -> 303 redirect to the viewer.
 *
 * v1: enqueue instead. After the documents row is inserted with status "queued",
 * push { documentId } onto a BullMQ queue and return immediately; the worker calls
 * runRoute() and writes the extraction_run. See SPEC.md "v1".
 */
export async function POST(request: Request) {
  const form = await request.formData();
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
  const sha = sha256Hex(bytes);
  const key = documentKey(sha);

  // Identical content -> same key, same row. Re-uploading just opens the existing viewer.
  const existing = await db().query.documents.findFirst({ where: eq(schema.documents.sha256, sha) });
  if (existing) {
    return redirectTo(request, `/documents/${existing.id}`);
  }

  const { url } = await putObject({ key, body: bytes, contentType: "application/pdf" });

  const [doc] = await db()
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

  try {
    const { textLayer, plan, result } = await runRoute(bytes, doc.filename);

    await db()
      .insert(schema.extractionRuns)
      .values({
        documentId: doc.id,
        model: plan.model,
        inputMode: plan.inputMode,
        pdfEngine: plan.pdfEngine ?? null,
        promptVersion: result.promptVersion,
        output: result.envelope ?? safeJson(result.raw),
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
    const message = err instanceof Error ? err.message : String(err);
    await db()
      .insert(schema.extractionRuns)
      .values({
        documentId: doc.id,
        model: "unknown",
        inputMode: "text",
        promptVersion: "n/a",
        schemaValid: false,
        error: message,
      });
    await db().update(schema.documents).set({ status: "failed" }).where(eq(schema.documents.id, doc.id));
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

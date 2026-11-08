import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { documentKey, sha256Hex } from "@/lib/storage/r2";
import { analyzeTextLayer } from "@/lib/parse/text-layer";

/**
 * Ensures a `documents` row exists for a sample PDF and returns it.
 * `public_url` stays null until `pnpm samples:upload` pushes the file to R2.
 */
export async function ensureDocument(filename: string, bytes: Uint8Array) {
  const sha = sha256Hex(bytes);
  const existing = await db().query.documents.findFirst({
    where: eq(schema.documents.sha256, sha),
  });
  if (existing) return existing;

  const tl = await analyzeTextLayer(bytes);
  const [row] = await db()
    .insert(schema.documents)
    .values({
      filename,
      storageKey: documentKey(sha),
      publicUrl: null,
      bytes: bytes.byteLength,
      sha256: sha,
      pageCount: tl.pageCount,
      hasTextLayer: tl.hasTextLayer,
      status: "queued",
    })
    .returning();
  return row;
}

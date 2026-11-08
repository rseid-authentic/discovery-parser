import "./lib/load-env";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { analyzeTextLayer } from "@/lib/parse/text-layer";
import { documentKey, putObject, sha256Hex } from "@/lib/storage/blob";
import { loadSamples } from "./lib/samples";

/**
 * Pushes data/samples/*.pdf to Blob under content-hashed keys and upserts `documents`.
 * Safe to re-run: existing objects are skipped, rows are updated in place.
 *
 * Usage: pnpm samples:upload [--docs 'UPX*.pdf']
 */
const { values } = parseArgs({ options: { docs: { type: "string", default: "*.pdf" } } });
const samples = loadSamples(values.docs);
console.log(`Uploading ${samples.length} sample(s)`);

for (const sample of samples) {
  const sha = sha256Hex(sample.bytes);
  const key = documentKey(sha);
  const { url, exists } = await putObject({ key, body: sample.bytes, contentType: "application/pdf" });
  const tl = await analyzeTextLayer(sample.bytes);

  const existing = await db().query.documents.findFirst({ where: eq(schema.documents.sha256, sha) });
  if (existing) {
    await db()
      .update(schema.documents)
      .set({ publicUrl: url, storageKey: key, pageCount: tl.pageCount, hasTextLayer: tl.hasTextLayer })
      .where(eq(schema.documents.id, existing.id));
  } else {
    await db().insert(schema.documents).values({
      filename: `${sample.name}.pdf`,
      storageKey: key,
      publicUrl: url,
      bytes: sample.bytes.byteLength,
      sha256: sha,
      pageCount: tl.pageCount,
      hasTextLayer: tl.hasTextLayer,
      status: "queued",
    });
  }
  console.log(`${exists ? "exists " : "uploaded"} ${sample.name} -> ${url} (${tl.pageCount}p, text=${tl.hasTextLayer})`);
}
console.log("Done. Check response cache headers on a second fetch of a public Blob URL.");

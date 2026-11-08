import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { StatusBadge } from "@/components/status-badge";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Upload a PDF</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Stored in Vercel Blob, text layer detected, parsed synchronously (v0), then shown beside the original. PDFs must be 4 MB or smaller.
        </p>
        {/* Plain multipart POST to the route handler; no client JS needed in v0. */}
        <form
          action="/api/upload"
          method="post"
          encType="multipart/form-data"
          className="mt-4 flex flex-wrap items-center gap-3"
        >
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="text-sm file:mr-3 file:rounded file:border file:border-neutral-300 file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
          />
          <button
            type="submit"
            className="rounded bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Upload & parse
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Documents</h2>
        <Suspense fallback={<p className="text-sm text-neutral-500">Loading documents…</p>}>
          <DocumentsTable />
        </Suspense>
      </section>
    </div>
  );
}

async function DocumentsTable() {
  // Always fresh: exclude from prerendering so `next build` never touches the DB.
  await connection();

  let rows: Awaited<ReturnType<typeof loadRows>>;
  try {
    rows = await loadRows();
  } catch (err) {
    return (
      <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Could not load documents: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No documents yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-500">
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-2 pr-4 font-medium">File</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Pages</th>
            <th className="py-2 pr-4 font-medium">Text layer</th>
            <th className="py-2 pr-4 font-medium">Model</th>
            <th className="py-2 pr-4 font-medium">Mode</th>
            <th className="py-2 pr-4 font-medium">Cost</th>
            <th className="py-2 pr-4 font-medium">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.doc.id} className="border-b border-neutral-100 dark:border-neutral-900">
              <td className="py-2 pr-4">
                <Link href={`/documents/${r.doc.id}`} className="underline-offset-2 hover:underline">
                  {r.doc.filename}
                </Link>
              </td>
              <td className="py-2 pr-4">
                <StatusBadge status={r.doc.status} />
              </td>
              <td className="py-2 pr-4">{r.doc.pageCount ?? "–"}</td>
              <td className="py-2 pr-4">{r.doc.hasTextLayer == null ? "–" : r.doc.hasTextLayer ? "yes" : "no"}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.run?.model ?? "–"}</td>
              <td className="py-2 pr-4">{r.run ? `${r.run.inputMode}${r.run.pdfEngine ? "/" + r.run.pdfEngine : ""}` : "–"}</td>
              <td className="py-2 pr-4">{r.run?.costUsd ? `$${Number(r.run.costUsd).toFixed(4)}` : "–"}</td>
              <td className="py-2 pr-4 text-neutral-500">{r.doc.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function loadRows() {
  const docs = await db().select().from(schema.documents).orderBy(desc(schema.documents.createdAt)).limit(200);
  const runs = await db().select().from(schema.extractionRuns).orderBy(desc(schema.extractionRuns.createdAt));
  const latest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) if (!latest.has(run.documentId)) latest.set(run.documentId, run);
  return docs.map((doc) => ({ doc, run: latest.get(doc.id) ?? null }));
}

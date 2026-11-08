import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export default function RunsPage({ params }: PageProps<"/documents/[id]/runs">) {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading runs…</p>}>
      <RunsView params={params} />
    </Suspense>
  );
}

async function RunsView({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const doc = await db().query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) notFound();
  const runs = await db()
    .select()
    .from(schema.extractionRuns)
    .where(eq(schema.extractionRuns.documentId, id))
    .orderBy(desc(schema.extractionRuns.createdAt));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">
        Runs for{" "}
        <Link href={`/documents/${doc.id}`} className="underline underline-offset-2">
          {doc.filename}
        </Link>
      </h1>
      {runs.length === 0 && <p className="text-sm text-neutral-500">No runs.</p>}
      <table className="w-full text-sm">
        <thead className="text-left text-neutral-500">
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Model</th>
            <th className="py-2 pr-4 font-medium">Mode</th>
            <th className="py-2 pr-4 font-medium">Prompt</th>
            <th className="py-2 pr-4 font-medium">Valid</th>
            <th className="py-2 pr-4 font-medium">Tokens</th>
            <th className="py-2 pr-4 font-medium">Cost</th>
            <th className="py-2 pr-4 font-medium">Latency</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-b border-neutral-100 align-top dark:border-neutral-900">
              <td className="py-2 pr-4 text-neutral-500">{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.model}</td>
              <td className="py-2 pr-4">{r.inputMode}{r.pdfEngine ? `/${r.pdfEngine}` : ""}</td>
              <td className="py-2 pr-4 font-mono text-xs">{r.promptVersion}</td>
              <td className="py-2 pr-4">{r.schemaValid ? "yes" : <span className="text-red-700">no</span>}</td>
              <td className="py-2 pr-4">{r.inputTokens ?? "?"} / {r.outputTokens ?? "?"}</td>
              <td className="py-2 pr-4">{r.costUsd ? `$${Number(r.costUsd).toFixed(4)}` : "–"}</td>
              <td className="py-2 pr-4">{r.latencyMs ?? "?"} ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

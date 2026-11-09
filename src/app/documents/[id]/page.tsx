import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { StatusBadge } from "@/components/status-badge";
import { ReviewTabs } from "@/components/ground-truth-review";
import { EnvelopeSchema, ExtractedTextSchema, GroundTruthEnvelopeSchema, type Envelope, type Field } from "@/lib/schema/envelope";
import { routeLabel } from "@/lib/parse/route-label";
import { selectRun } from "@/lib/parse/select-run";

export default function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading document…</p>}>
      <DocumentView params={params} />
    </Suspense>
  );
}

async function DocumentView({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const doc = await db().query.documents.findFirst({ where: eq(schema.documents.id, id) });
  if (!doc) notFound();

  const runs = await db().query.extractionRuns.findMany({
    where: eq(schema.extractionRuns.documentId, id),
    orderBy: [desc(schema.extractionRuns.createdAt), desc(schema.extractionRuns.id)],
  });
  const run = selectRun(runs);
  const latest = runs[0];

  const parsed = run?.schemaValid ? EnvelopeSchema.safeParse(run.output) : null;
  const envelope: Envelope | null = parsed?.success ? parsed.data : null;
  const failedText = run && !envelope && run.output && typeof run.output === "object" && "extracted_text" in run.output ? ExtractedTextSchema.safeParse(run.output.extracted_text) : null;
  const failedSource = run && !envelope && run.output && typeof run.output === "object" && "source_text_layer" in run.output ? ExtractedTextSchema.safeParse(run.output.source_text_layer) : null;
  const draftRow = await db().query.groundTruth.findFirst({ where: eq(schema.groundTruth.documentId, id) });
  const draftResult = draftRow ? GroundTruthEnvelopeSchema.safeParse(draftRow.envelope) : null;
  const draft = draftResult?.success && draftResult.data._meta?.draft === true ? draftResult.data : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">{doc.filename}</h1>
        <StatusBadge status={doc.status} />
        <span className="text-sm text-neutral-500">
          {doc.pageCount ?? "?"} pages · text layer: {doc.hasTextLayer == null ? "?" : doc.hasTextLayer ? "yes" : "no"}
        </span>
        <Link href={`/documents/${doc.id}/runs`} className="text-sm underline underline-offset-2">
          all runs
        </Link>
      </div>

      {run && (
        <p className="text-xs text-neutral-500">
          Displayed run <span className="font-mono">{run.id}</span> · <span className="font-mono">{run.model}</span> · {routeLabel(run)} · prompt {run.promptVersion} · {run.latencyMs ?? "?"} ms ·{" "}
          {run.costUsd ? `$${Number(run.costUsd).toFixed(4)}` : "cost n/a"} · {run.inputTokens ?? "?"} in /{" "}
          {run.outputTokens ?? "?"} out tokens
        </p>
      )}
      {latest && run && latest.id !== run.id && <p className="rounded border border-amber-300 p-2 text-sm dark:border-amber-700">The latest run did not produce a usable extraction. Showing the earlier successful run. See all runs for details.</p>}

      {draft?._meta?.source_url === "https://huggingface.co/datasets/jsdnrs/ICDAR2019-SROIE" && (
        <p className="text-xs text-neutral-500">Source: <a className="underline" href={draft._meta.source_url}>SROIE (Huang et al.), jsdnrs edition</a>, <a className="underline" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Original JPEG converted to a PDF.</p>
      )}

      {/* Two panes: fields left, original PDF right. v2: replace the iframe with pdf.js and
          highlight each field's bbox on click (needs bbox in Field<T>). */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          {!envelope && <h2 className="mb-2 text-sm font-semibold">Extracted envelope</h2>}
          {!run && <p className="text-sm text-neutral-500">No extraction run yet.</p>}
          {run && !envelope && (
            <div className="space-y-2 text-sm">
              <p className="text-red-700">Extraction did not produce a schema-valid envelope.</p>
              {failedText?.success && <><p className="text-neutral-500">Document text was recovered despite the failed field extraction. It may contain errors.</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-2 dark:bg-neutral-900">{failedText.data.text}</pre></>}
              {!failedText?.success && failedSource?.success && <><p className="text-neutral-500">Partial PDF text layer recovered despite the failed extraction; it may be incomplete.</p><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-2 dark:bg-neutral-900">{failedSource.data.text}</pre></>}
              <a href={`/api/documents/${doc.id}/export?runId=${run.id}`} className="underline">Open machine-readable JSON</a>
            </div>
          )}
          {envelope && run && <ReviewTabs key={run.id} documentId={doc.id} runId={run.id} filename={doc.filename} envelope={envelope} draft={draft} draftRevision={draft ? draftRow?.updatedAt.toISOString() : undefined}>
            <EnvelopeFields envelope={envelope} />
          </ReviewTabs>}
        </section>

        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800">
          {doc.publicUrl ? (
            <iframe
              src={doc.publicUrl}
              title={doc.filename}
              className="h-[80vh] w-full rounded-lg"
            />
          ) : (
            <p className="p-3 text-sm text-neutral-500">
              No public URL (not uploaded to Blob). Run <code>pnpm samples:upload</code>.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

const SCALAR_FIELDS: Array<keyof Envelope> = [
  "doc_type",
  "title_or_subject",
  "doc_date",
  "author_from",
  "bates_begin",
  "bates_end",
  "page_count",
  "has_privilege_legend",
  "has_redactions",
  "language",
];
const ARRAY_FIELDS: Array<keyof Envelope> = ["recipients_to", "cc", "organizations", "people"];

function EnvelopeFields({ envelope }: { envelope: Envelope }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-neutral-500">overall confidence {(envelope.overall_confidence * 100).toFixed(0)}%</p>
      {envelope.date_uncertainty && <p className="rounded border border-amber-300 p-2 text-sm dark:border-amber-700">Date needs review: {envelope.date_uncertainty}</p>}
      <dl className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {SCALAR_FIELDS.map((name) => (
          <FieldRow key={name} name={name} field={envelope[name] as Field<unknown>} />
        ))}
        {ARRAY_FIELDS.map((name) => {
          const items = envelope[name] as Field<string>[];
          return (
            <div key={name} className="py-2">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">{name}</dt>
              <dd className="mt-1 space-y-1">
                {items.length === 0 && <span className="text-neutral-400">–</span>}
                {items.map((f, i) => (
                  <FieldValue key={i} field={f} />
                ))}
              </dd>
            </div>
          );
        })}
      </dl>
      {envelope.document_details && envelope.document_details.length > 0 && <div className="border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <h3 className="font-semibold">Document details</h3>
        <p className="mb-2 text-xs text-neutral-500">Model-suggested, not yet evaluated. Check against the document.</p>
        <dl className="divide-y divide-neutral-100 dark:divide-neutral-900">{envelope.document_details.map((detail, i) => <div key={i} className="py-2"><dt className="text-xs uppercase text-neutral-500">{detail.label}</dt><dd><FieldValue field={detail} /></dd></div>)}</dl>
      </div>}
      <div>
        <h3 className="text-xs uppercase tracking-wide text-neutral-500">summary (unscored)</h3>
        <p className="mt-1">{envelope.summary}</p>
      </div>
    </div>
  );
}

function FieldRow({ name, field }: { name: string; field: Field<unknown> }) {
  return (
    <div className="py-2">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{name}</dt>
      <dd className="mt-1">
        <FieldValue field={field} />
      </dd>
    </div>
  );
}

function FieldValue({ field }: { field: Field<unknown> }) {
  const value = field.value;
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className={value === null ? "text-neutral-400" : ""}>
        {value === null ? "null" : typeof value === "boolean" ? String(value) : String(value)}
      </span>
      <ConfidenceBadge confidence={field.confidence} />
      {field.page != null && <span className="text-xs text-neutral-500">p.{field.page}</span>}
      {field.source_text && (
        <span className="truncate text-xs text-neutral-400" title={field.source_text}>
          “{field.source_text}”
        </span>
      )}
    </div>
  );
}

/** Thresholds are placeholders; the user calibrates them from eval results. */
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color =
    confidence >= 0.9
      ? "bg-emerald-100 text-emerald-800"
      : confidence >= 0.7
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>{(confidence * 100).toFixed(0)}%</span>;
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DOC_TYPES, GroundTruthEnvelopeSchema, type Envelope, type Field } from "../lib/schema/envelope";

type FieldKey =
  | "doc_type" | "title_or_subject" | "doc_date" | "author_from"
  | "recipients_to" | "cc" | "organizations" | "people"
  | "bates_begin" | "bates_end" | "page_count" | "has_privilege_legend"
  | "has_redactions" | "language";

type Kind = "text" | "date" | "type" | "number" | "boolean" | "list";
type ReviewField = { value: string; page: string; source: string; reviewed: boolean };
type ReviewState = Record<FieldKey, ReviewField>;

const FIELDS: { key: FieldKey; label: string; kind: Kind; help?: string }[] = [
  { key: "doc_type", label: "Document type", kind: "type" },
  { key: "title_or_subject", label: "Title or subject", kind: "text" },
  { key: "doc_date", label: "Document date", kind: "date", help: "Use YYYY-MM-DD; leave blank if unknown." },
  { key: "author_from", label: "Author or sender", kind: "text" },
  { key: "recipients_to", label: "Recipients", kind: "list" },
  { key: "cc", label: "CC", kind: "list" },
  { key: "organizations", label: "Organizations", kind: "list" },
  { key: "people", label: "People", kind: "list" },
  { key: "bates_begin", label: "First Bates number", kind: "text" },
  { key: "bates_end", label: "Last Bates number", kind: "text" },
  { key: "page_count", label: "Page count", kind: "number" },
  { key: "has_privilege_legend", label: "Privilege legend present", kind: "boolean", help: "A visible legend is a signal, not a legal determination." },
  { key: "has_redactions", label: "Redactions visible", kind: "boolean" },
  { key: "language", label: "Language", kind: "text", help: "Language code, for example en." },
];

export function initialReview(envelope: Envelope): ReviewState {
  return Object.fromEntries(FIELDS.map(({ key, kind }) => {
    const field = envelope[key];
    if (kind === "list") {
      const list = field as Field<string>[];
      return [key, { value: list.map((item) => item.value ?? "").filter(Boolean).join("\n"), page: "", source: "", reviewed: false }];
    }
    const item = field as Field<string | number | boolean>;
    return [key, { value: item.value == null ? "" : String(item.value), page: item.page == null ? "" : String(item.page), source: item.source_text ?? "", reviewed: false }];
  })) as ReviewState;
}

function loadSaved(key: string, initial: ReviewState): ReviewState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return initial;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return initial;
    const candidate = saved as Record<string, unknown>;
    for (const { key: fieldKey } of FIELDS) {
      const field = candidate[fieldKey];
      if (!field || typeof field !== "object") return initial;
      const item = field as Record<string, unknown>;
      if (typeof item.value !== "string" || typeof item.page !== "string" || typeof item.source !== "string" || typeof item.reviewed !== "boolean") return initial;
    }
    return candidate as ReviewState;
  } catch {
    return initial;
  }
}

export function groundTruth(review: ReviewState) {
  const values: Record<string, unknown> = {};
  for (const { key, kind } of FIELDS) {
    const item = review[key];
    if (kind === "list") {
      values[key] = item.value.split("\n").map((value) => value.trim()).filter(Boolean).map((value) => ({ value }));
      continue;
    }
    let value: string | number | boolean | null = item.value.trim() || null;
    if (kind === "boolean" && value !== null) value = value === "true";
    if (kind === "number" && value !== null) value = Number(value);
    values[key] = {
      value,
      page: item.page.trim() ? Number(item.page) : null,
      source_text: item.source.trim() || null,
    };
  }
  return GroundTruthEnvelopeSchema.parse(values);
}

export function ReviewTabs({ documentId, runId, filename, envelope, children }: {
  documentId: string;
  runId: string;
  filename: string;
  envelope: Envelope;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"extraction" | "review">("extraction");
  const active = "border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100";
  const inactive = "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200";
  return (
    <div>
      <div role="tablist" aria-label="Document information" className="mb-4 flex gap-5 border-b border-neutral-200 dark:border-neutral-800">
        <button id="extraction-tab" type="button" role="tab" aria-selected={tab === "extraction"} aria-controls="extraction-panel" className={`border-b-2 pb-2 text-sm font-medium ${tab === "extraction" ? active : inactive}`} onClick={() => setTab("extraction")}>Extraction</button>
        <button id="review-tab" type="button" role="tab" aria-selected={tab === "review"} aria-controls="review-panel" className={`border-b-2 pb-2 text-sm font-medium ${tab === "review" ? active : inactive}`} onClick={() => setTab("review")}>Review</button>
      </div>
      {tab === "extraction" ? (
        <div id="extraction-panel" role="tabpanel" aria-labelledby="extraction-tab">{children}</div>
      ) : (
        <div id="review-panel" role="tabpanel" aria-labelledby="review-tab"><GroundTruthReview documentId={documentId} runId={runId} filename={filename} envelope={envelope} /></div>
      )}
    </div>
  );
}

export function GroundTruthReview({ documentId, runId, filename, envelope }: {
  documentId: string;
  runId: string;
  filename: string;
  envelope: Envelope;
}) {
  const storageKey = `discovery-review:v1:${documentId}:${runId}`;
  const [review, setReview] = useState(() => initialReview(envelope));
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "unavailable">("saved");
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setReview(loadSaved(storageKey, initialReview(envelope)));
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, envelope]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(review));
    } catch {
      const timer = setTimeout(() => setSaveState("unavailable"), 0);
      return () => clearTimeout(timer);
    }
  }, [review, loaded, storageKey]);

  function update(key: FieldKey, changes: Partial<ReviewField>) {
    setReview((current) => ({ ...current, [key]: { ...current[key], ...changes } }));
    setError("");
  }

  function updateValue(key: FieldKey, value: string) {
    // Old model evidence may no longer support a corrected value.
    update(key, { value, page: "", source: "", reviewed: false });
  }

  const reviewed = FIELDS.filter(({ key }) => review[key].reviewed).length;
  const sampleName = filename.replace(/\.pdf$/i, "").replace(/[\\/\x00-\x1f]/g, "_");

  function exportLabel() {
    if (reviewed !== FIELDS.length) {
      setError("Mark every field reviewed before exporting a final label.");
      return;
    }
    try {
      const label = groundTruth(review);
      const file = new Blob([JSON.stringify(label, null, 2) + "\n"], { type: "application/json" });
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sampleName}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid review values.");
    }
  }

  if (!loaded) return <p className="text-sm text-neutral-500">Loading review…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Review for evaluation</h3>
          <p className="text-xs text-neutral-500">{reviewed} of {FIELDS.length} fields reviewed · {saveState === "saved" ? "progress saved in this browser" : "browser storage unavailable; progress will not persist"}</p>
        </div>
        <button type="button" onClick={exportLabel} className="rounded bg-neutral-900 px-3 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900">Download reviewed label</button>
      </div>
      <p className="text-xs text-neutral-500">Correct each value against the PDF, then check it off. Leave unknown values blank. The field list is still a draft.</p>
      <p className="text-xs text-neutral-500">Save the downloaded <code>{sampleName}.json</code> in <code>data/ground-truth/</code>; the matching <code>{sampleName}.pdf</code> must be in <code>data/samples/</code>. Progress stays in this browser until export.</p>
      {error && <p role="alert" className="whitespace-pre-wrap rounded border border-red-300 p-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <div className="divide-y divide-neutral-200 rounded border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {FIELDS.map(({ key, label, kind, help }) => {
          const item = review[key];
          const common = "w-full rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700";
          return (
            <div key={key} className="px-3 py-2">
              <div className="grid items-start gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center">
                <label htmlFor={`review-${key}`} className="text-sm font-medium" title={help}>{label}</label>
                {kind === "list" ? (
                  <textarea id={`review-${key}`} aria-describedby={`help-${key}`} className={`${common} min-h-9 resize-y`} rows={1} placeholder="One value per line" value={item.value} onChange={(event) => updateValue(key, event.target.value)} />
                ) : kind === "type" || kind === "boolean" ? (
                  <select id={`review-${key}`} className={common} value={item.value} onChange={(event) => updateValue(key, event.target.value)}>
                    <option value="">Unknown / not present</option>
                    {kind === "type" ? DOC_TYPES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>) : <><option value="true">Yes</option><option value="false">No</option></>}
                  </select>
                ) : (
                  <input id={`review-${key}`} type={kind === "number" ? "number" : kind === "date" ? "date" : "text"} min={kind === "number" ? 1 : undefined} className={common} value={item.value} onChange={(event) => updateValue(key, event.target.value)} />
                )}
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs"><input type="checkbox" aria-label={`Mark ${label} reviewed`} checked={item.reviewed} onChange={(event) => update(key, { reviewed: event.target.checked })} /> Reviewed</label>
              </div>
              {kind === "list" ? <p id={`help-${key}`} className="mt-1 text-xs text-neutral-500 sm:pl-42">One value per line.</p> : <details className="mt-1 text-xs text-neutral-500 sm:pl-42">
                <summary className="cursor-pointer">Source details{item.page ? ` · p.${item.page}` : ""}</summary>
                {help && <p className="mt-1">{help}</p>}
                <div className="mt-2 grid gap-2 sm:grid-cols-[6rem_1fr]">
                  <label>Page<input aria-label={`${label} source page`} type="number" min={1} className={common} value={item.page} onChange={(event) => update(key, { page: event.target.value, reviewed: false })} /></label>
                  <label>Supporting text<input aria-label={`${label} supporting text`} className={common} value={item.source} onChange={(event) => update(key, { source: event.target.value, reviewed: false })} /></label>
                </div>
              </details>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

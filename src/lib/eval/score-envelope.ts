import { DOC_TYPES, type Envelope, type GroundTruthEnvelope } from "@/lib/schema/envelope";
import {
  bates,
  boolean,
  caseInsensitiveString,
  enumMatch,
  fuzzyString,
  integer,
  isoDate,
  setF1,
  type ScoreResult,
  type Scorer,
} from "./scorers";

export type FieldScore = {
  field: string;
  scorer: string;
  expected: unknown;
  actual: unknown;
} & ScoreResult;

/** Field -> scorer. `summary` and `overall_confidence` are deliberately unscored in v0. */
export const FIELD_SCORERS: Record<string, { scorer: Scorer; name: string; kind: "scalar" | "array" }> = {
  doc_type: { scorer: enumMatch(DOC_TYPES), name: "enumMatch", kind: "scalar" },
  title_or_subject: { scorer: fuzzyString(), name: "fuzzyString", kind: "scalar" },
  doc_date: { scorer: isoDate, name: "isoDate", kind: "scalar" },
  author_from: { scorer: fuzzyString(), name: "fuzzyString", kind: "scalar" },
  recipients_to: { scorer: setF1(), name: "setF1", kind: "array" },
  cc: { scorer: setF1(), name: "setF1", kind: "array" },
  organizations: { scorer: setF1(), name: "setF1", kind: "array" },
  people: { scorer: setF1(), name: "setF1", kind: "array" },
  bates_begin: { scorer: bates, name: "bates", kind: "scalar" },
  bates_end: { scorer: bates, name: "bates", kind: "scalar" },
  page_count: { scorer: integer, name: "integer", kind: "scalar" },
  has_privilege_legend: { scorer: boolean, name: "boolean", kind: "scalar" },
  has_redactions: { scorer: boolean, name: "boolean", kind: "scalar" },
  language: { scorer: caseInsensitiveString, name: "caseInsensitiveString", kind: "scalar" },
};

export const SCORED_FIELDS = Object.keys(FIELD_SCORERS);

/**
 * Fields that must ALL be correct for a document to "pass".
 * DRAFT: the user decides what is critical for their review workflow.
 */
export const CRITICAL_FIELDS = ["doc_type", "doc_date", "bates_begin", "bates_end"] as const;

type AnyField = { value: unknown } | null | undefined;

function unwrap(f: AnyField): unknown {
  return f ? f.value : null;
}

function unwrapArray(arr: AnyField[] | null | undefined): unknown[] {
  if (!arr) return [];
  return arr.map(unwrap).filter((v) => v !== null && v !== undefined);
}

/** Scores an extracted envelope (or null when extraction failed) against ground truth. */
export function scoreEnvelope(expected: GroundTruthEnvelope, actual: Envelope | null): FieldScore[] {
  const out: FieldScore[] = [];
  for (const [field, { scorer, name, kind }] of Object.entries(FIELD_SCORERS)) {
    const e = (expected as Record<string, unknown>)[field];
    const a = actual ? (actual as Record<string, unknown>)[field] : null;
    let ev: unknown;
    let av: unknown;
    if (kind === "array") {
      ev = unwrapArray(e as AnyField[]);
      av = actual ? unwrapArray(a as AnyField[]) : null;
    } else {
      ev = unwrap(e as AnyField);
      av = actual ? unwrap(a as AnyField) : null;
    }
    const res = actual
      ? scorer(ev, av)
      : // No envelope at all (schema failure after repair): every field is a schema violation,
        // except fields the label also says are absent.
        isEmpty(ev)
        ? { score: 1, status: "correct" as const }
        : { score: 0, status: "schema_violation" as const };
    out.push({ field, scorer: name, expected: ev, actual: av, ...res });
  }
  return out;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (Array.isArray(v) && v.length === 0);
}

/** Document pass gate: every critical field correct. */
export function documentPasses(scores: FieldScore[]): boolean {
  return CRITICAL_FIELDS.every((f) => scores.find((s) => s.field === f)?.status === "correct");
}

import { z } from "zod";

/**
 * The "envelope": document-level metadata shared by every discovery document,
 * regardless of type. Doc-type-specific sub-schemas are v2 (see SPEC.md).
 *
 * NOTE: the field list below is a DRAFT. The user owns domain judgment and
 * finalizes which fields exist, which are critical, and what counts as a match.
 *
 * Every scalar is wrapped in `Field<T>` so provenance travels with the value.
 * Zero optional keys on purpose: strict JSON-schema modes (OpenAI, Gemini)
 * reject optional properties, so everything is required-but-nullable.
 */

/** Provenance wrapper. Keep this tiny; v2 adds `bbox`. */
export function field<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable().describe("The extracted value, or null if absent from the document."),
    confidence: z
      .number()
      .min(0)
      .max(1)
      .describe("Model's own confidence 0-1 that `value` is correct (0 when value is null)."),
    page: z
      .number()
      .int()
      .positive()
      .nullable()
      .describe("1-based page where the value was found, or null."),
    source_text: z
      .string()
      .nullable()
      .describe("Verbatim snippet from the document supporting the value, or null."),
  });
}

export type Field<T> = {
  value: T | null;
  confidence: number;
  page: number | null;
  source_text: string | null;
};

export const DOC_TYPES = [
  "email",
  "memo",
  "letter",
  "financial_statement",
  "invoice",
  "spreadsheet",
  "presentation",
  "contract",
  "meeting_notes",
  "chat_log",
  "report",
  "form",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date YYYY-MM-DD")
  .describe("ISO 8601 calendar date, YYYY-MM-DD. Date only, no time.");

const bates = z
  .string()
  .min(1)
  .describe(
    "Bates number exactly as printed, preserving prefix, case and leading zeros (e.g. GOOG-DOJ-00123456).",
  );

export const EnvelopeSchema = z.object({
  doc_type: field(z.enum(DOC_TYPES)),
  title_or_subject: field(z.string()).describe("Email subject, memo RE: line, report title, etc."),
  doc_date: field(isoDate).describe("Primary date of the document (sent date, memo date, period end)."),
  author_from: field(z.string()).describe("Author or sender as written (name and/or email)."),
  recipients_to: z.array(field(z.string())).describe("Direct recipients, one Field per recipient."),
  cc: z.array(field(z.string())).describe("CC recipients, one Field per recipient."),
  organizations: z.array(field(z.string())).describe("Distinct organizations named in the document."),
  people: z.array(field(z.string())).describe("Distinct people named in the document."),
  bates_begin: field(bates),
  bates_end: field(bates),
  page_count: field(z.number().int().positive()),
  has_privilege_legend: field(z.boolean()).describe(
    'True if a legend such as "Privileged & Confidential" or "Attorney-Client" appears.',
  ),
  has_redactions: field(z.boolean()).describe("True if any text is visibly redacted/blacked out."),
  language: field(z.string()).describe("BCP-47 language code of the body text, e.g. en, de."),
  summary: z
    .string()
    .describe("Two to four sentence neutral summary. Not scored in v0."),
  overall_confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Model's overall confidence 0-1 in the whole envelope."),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
export type EnvelopeFieldName = keyof Envelope;

/** JSON Schema (draft 2020-12) in case a tool or model needs it directly. */
export const envelopeJsonSchema = z.toJSONSchema(EnvelopeSchema);

// ---------------------------------------------------------------------------
// Ground truth. Same shape, but `confidence`/`page`/`source_text` are optional
// because a human labeller should not have to invent confidences.
// ---------------------------------------------------------------------------

function gtField<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable(),
    confidence: z.number().min(0).max(1).optional(),
    page: z.number().int().positive().nullable().optional(),
    source_text: z.string().nullable().optional(),
  });
}

export const GroundTruthEnvelopeSchema = z.object({
  _meta: z
    .object({
      draft: z.boolean().optional(),
      model: z.string().optional(),
      generated_at: z.string().optional(),
      source_url: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  doc_type: gtField(z.enum(DOC_TYPES)),
  title_or_subject: gtField(z.string()),
  doc_date: gtField(isoDate),
  author_from: gtField(z.string()),
  recipients_to: z.array(gtField(z.string())),
  cc: z.array(gtField(z.string())),
  organizations: z.array(gtField(z.string())),
  people: z.array(gtField(z.string())),
  bates_begin: gtField(bates),
  bates_end: gtField(bates),
  page_count: gtField(z.number().int().positive()),
  has_privilege_legend: gtField(z.boolean()),
  has_redactions: gtField(z.boolean()),
  language: gtField(z.string()),
  summary: z.string().optional(),
  overall_confidence: z.number().min(0).max(1).optional(),
});

export type GroundTruthEnvelope = z.infer<typeof GroundTruthEnvelopeSchema>;

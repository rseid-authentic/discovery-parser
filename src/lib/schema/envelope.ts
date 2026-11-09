import { z } from "zod";

/**
 * The "envelope": document-level metadata shared by every discovery document,
 * regardless of type. New runs can also include unscored document details.
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
    value: value.nullable().describe("The extracted value, or null if absent or not reliably determined."),
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

const documentDetails = z.array(z.object({
  label: z.string().describe("Short descriptive name for the fact, such as Grand total."),
  value: z.string().describe("Value as written, including currency or units when shown."),
  confidence: z.number().min(0).max(1),
  page: z.number().int().positive().nullable(),
  source_text: z.string().nullable(),
}));

export const ExtractedTextSchema = z.object({
  source: z.enum(["pdf-text-layer", "openrouter-file-parser"]),
  text: z.string(),
});
export type ExtractedText = z.infer<typeof ExtractedTextSchema>;

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
  // Optional when reading legacy runs; new extractions use the strict schema below.
  date_uncertainty: z.string().nullable().optional(),
  document_details: documentDetails.optional(),
  extracted_text: ExtractedTextSchema.optional(),
  source_text_layer: ExtractedTextSchema.optional(),
});

/** New calls require these keys; older persisted envelopes remain readable. */
export const ExtractionEnvelopeSchema = EnvelopeSchema.omit({ extracted_text: true, source_text_layer: true }).extend({
  date_uncertainty: z.string().nullable().describe("Explain an ambiguous or unreadable document date, or null if none."),
  document_details: documentDetails.describe("A few important, document-specific facts with evidence; empty if none."),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;
export type EnvelopeFieldName = keyof Envelope;

/** Never expose a guessed normalized date as certain when ambiguity is reported. */
export function normalizeDateUncertainty(envelope: Envelope): Envelope {
  if (!envelope.date_uncertainty?.trim() || envelope.doc_date.value === null) return envelope;
  return { ...envelope, doc_date: { ...envelope.doc_date, value: null, confidence: 0 } };
}

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
      unresolved_fields: z.array(z.string()).optional(),
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

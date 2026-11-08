import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const documentStatus = pgEnum("document_status", ["queued", "parsing", "parsed", "failed"]);
export const inputMode = pgEnum("input_mode", ["text", "pdf"]);
export const evalStatus = pgEnum("eval_status", [
  "correct",
  "wrong",
  "omitted",
  "invented",
  "schema_violation",
]);

/** One row per uploaded original. The PDF itself lives in R2 under `storage_key`. */
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(), // docs/<sha256>.pdf
  publicUrl: text("public_url"), // null until uploaded to R2 (eval CLI may insert first)
  mime: text("mime").notNull().default("application/pdf"),
  bytes: integer("bytes").notNull(),
  sha256: text("sha256").notNull().unique(),
  pageCount: integer("page_count"),
  hasTextLayer: boolean("has_text_layer"),
  status: documentStatus("status").notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per model call (or bounded call+repair) against a document. */
export const extractionRuns = pgTable("extraction_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  model: text("model").notNull(), // OpenRouter model id
  inputMode: inputMode("input_mode").notNull(),
  pdfEngine: text("pdf_engine"), // native | mistral-ocr | pdf-text | null (text mode)
  promptVersion: text("prompt_version").notNull(),
  output: jsonb("output"), // Envelope JSON when schema_valid, else raw model text/JSON
  schemaValid: boolean("schema_valid").notNull().default(false),
  error: text("error"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  costUsd: numeric("cost_usd", { precision: 12, scale: 8 }),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Hand-labelled envelope per document. The user owns these; see data/ground-truth/README.md. */
export const groundTruth = pgTable("ground_truth", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  envelope: jsonb("envelope").notNull(),
  labeledBy: text("labeled_by"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One eval invocation (`pnpm eval --name ...`). `config` captures models/mode/engine/docs. */
export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per (eval run, extraction run, field). */
export const evalResults = pgTable("eval_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  evalRunId: uuid("eval_run_id")
    .notNull()
    .references(() => evalRuns.id, { onDelete: "cascade" }),
  extractionRunId: uuid("extraction_run_id")
    .notNull()
    .references(() => extractionRuns.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  expected: jsonb("expected"),
  actual: jsonb("actual"),
  scorer: text("scorer").notNull(),
  score: real("score").notNull(),
  status: evalStatus("status").notNull(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type ExtractionRun = typeof extractionRuns.$inferSelect;
export type NewExtractionRun = typeof extractionRuns.$inferInsert;
export type GroundTruthRow = typeof groundTruth.$inferSelect;
export type EvalRun = typeof evalRuns.$inferSelect;
export type NewEvalResult = typeof evalResults.$inferInsert;

# Ground truth

One JSON file per sample: `data/ground-truth/<sample basename>.json` for `data/samples/<sample basename>.pdf`.

Format: an Envelope (see `src/lib/schema/envelope.ts`, `GroundTruthEnvelopeSchema`) using the same Field wrapper `{ value, confidence?, page?, source_text? }`. `confidence`, `page` and `source_text` are optional; only `value` is required (use `null` when the document does not contain the field). List fields are arrays of Fields. `summary` and `overall_confidence` are optional and unscored. An optional `_meta` object holds notes and `source_url`.

Drafts: `scripts/bootstrap-labels.ts` (`pnpm eval:bootstrap`) writes `<name>.draft.json` with `_meta.draft: true`. These are model output and must be hand-corrected against the PDF, saved as `<name>.json`, and the draft flag removed. A file with `_meta.draft: true` makes `pnpm eval` fail loudly; `.draft.json` files are never read as truth.

Rules: dates are `YYYY-MM-DD`; Bates numbers exactly as printed; label what is in the document, not what you infer.

`example.json` is a schema-valid illustration, not tied to a real sample.

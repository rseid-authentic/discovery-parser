# 0001: Hybrid text vs vision routing

## Context
Discovery sets mix born-digital PDFs (emails, statements) and scans. Sending everything to a VLM is costly and weakest on provenance; sending everything through text extraction fails on scans.

## Decision
Detect a usable text layer with unpdf (avg chars/page). If present, send extracted text to the cheap text model. Otherwise send the PDF to a vision model via OpenRouter file input. `--mode` can force either path for eval comparisons.

## Consequences
- Cheaper and faster on the common case; page numbers come from text extraction.
- The detection threshold is a heuristic and can misroute poor OCR layers; the eval compares modes per doc to find out.
- Escalation across models is deferred to v1.

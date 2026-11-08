# 0002: No server-side PDF rendering in v0

## Context
Rasterising pages server-side (for OCR or VLM input) adds native dependencies, serverless size limits and cost, and v0 does not need bbox highlighting.

## Decision
v0 never renders pages on the server. Scans go to OpenRouter as the PDF file; OpenRouter's file-parser plugin (native, mistral-ocr, pdf-text) handles rasterisation. The viewer embeds the CDN-hosted PDF directly.

## Consequences
- Simple deploy on Vercel; fewer moving parts.
- No page images of our own, so no bbox overlay until v2 (pdf.js client-side).
- We depend on OpenRouter's PDF handling; the plugin option shape is marked `// VERIFY`.

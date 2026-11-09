import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { GroundTruthEnvelopeSchema, type GroundTruthEnvelope } from "@/lib/schema/envelope";

export const SAMPLES_DIR = "data/samples";
export const GROUND_TRUTH_DIR = "data/ground-truth";

export type Sample = {
  /** File name without .pdf, e.g. `UPX0001`. */
  name: string;
  path: string;
  bytes: Uint8Array;
};

/** Tiny glob: only `*` is supported (e.g. `UPX*.pdf`, `*.pdf`). Matched against the basename. */
export function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${esc}$`, "i");
}

export function loadSamples(glob = "*.pdf"): Sample[] {
  if (!existsSync(SAMPLES_DIR)) return [];
  const re = globToRegex(glob);
  return readdirSync(SAMPLES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".pdf") && re.test(d.name))
    .map((d) => {
      const path = join(SAMPLES_DIR, d.name);
      return { name: basename(d.name, ".pdf"), path, bytes: new Uint8Array(readFileSync(path)) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Returns the hand-labelled envelope for a sample, or null if none exists yet. Drafts are ignored. */
export function loadGroundTruth(name: string): GroundTruthEnvelope | null {
  const path = join(GROUND_TRUTH_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  const parsed = GroundTruthEnvelopeSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    throw new Error(`Invalid ground truth ${path}:\n${parsed.error.message}`);
  }
  if (parsed.data._meta?.draft) {
    throw new Error(`${path} is still marked _meta.draft: true. Hand-correct it and remove the flag.`);
  }
  if (parsed.data._meta?.unresolved_fields?.length) {
    throw new Error(`${path} has unresolved fields. Resolve them before scoring; unknown is not the same as absent.`);
  }
  return parsed.data;
}

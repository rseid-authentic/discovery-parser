import { z } from "zod";

/**
 * All environment access goes through this module.
 *
 * Validation is LAZY and grouped: nothing is read at import time, so
 * `pnpm build` succeeds with no env vars set, and the eval CLI (which only
 * needs OpenRouter + Postgres) does not fail on missing R2 credentials.
 */

const openrouterSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  DEFAULT_TEXT_MODEL: z.string().min(1).default("google/gemini-2.5-flash-lite"),
  DEFAULT_VISION_MODEL: z.string().min(1).default("google/gemini-2.5-flash-lite"),
});

const dbSchema = z.object({
  DATABASE_URL: z.string().min(1).startsWith("postgres"),
});

const r2Schema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  // e.g. https://cdn.example.com or https://pub-xxxx.r2.dev (no trailing slash)
  R2_PUBLIC_BASE_URL: z.url(),
});

function lazy<T extends z.ZodObject>(name: string, schema: T): () => z.infer<T> {
  let cached: z.infer<T> | undefined;
  return () => {
    if (cached) return cached;
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(
        `[env] Missing or invalid ${name} environment variables: ${missing}. ` +
          `Copy .env.example to .env.local and fill them in.`,
      );
    }
    cached = parsed.data;
    return cached;
  };
}

export const openrouterEnv = lazy("OpenRouter", openrouterSchema);
export const dbEnv = lazy("database", dbSchema);
export const r2Env = lazy("R2", r2Schema);

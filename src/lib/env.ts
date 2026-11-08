import { z } from "zod";

/**
 * All environment access goes through this module.
 *
 * Validation is LAZY and grouped: nothing is read at import time, so
 * `pnpm build` succeeds with no env vars set, and the eval CLI (which only
 * needs OpenRouter + Postgres) does not fail on missing Blob credentials.
 */

const openrouterSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  DEFAULT_TEXT_MODEL: z.string().min(1).default("openai/gpt-6-luna"),
  DEFAULT_VISION_MODEL: z.string().min(1).default("openai/gpt-6-luna"),
});

const dbSchema = z.object({
  DATABASE_URL: z.string().min(1).startsWith("postgres"),
});

const blobSchema = z.object({ BLOB_READ_WRITE_TOKEN: z.string().min(1) });

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
export const blobEnv = lazy("Vercel Blob", blobSchema);

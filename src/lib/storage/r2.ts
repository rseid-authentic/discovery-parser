import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2Env } from "@/lib/env";

let cached: S3Client | undefined;

/** Lazily constructed S3 client pointed at Cloudflare R2. */
export function r2(): S3Client {
  if (!cached) {
    const env = r2Env();
    cached = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return cached;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Content-addressed key: identical uploads collapse to one object and one cache entry. */
export function documentKey(sha256: string): string {
  return `docs/${sha256}.pdf`;
}

/** Public CDN URL for a key (R2 custom domain or r2.dev subdomain). */
export function publicUrl(key: string): string {
  return `${r2Env().R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

/**
 * Immutable because keys are content hashes. Watch `cf-cache-status` on the
 * CDN response to see HIT/MISS; v2 switches to signed URLs for private docs.
 */
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export async function putObject(args: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ key: string; url: string }> {
  const env = r2Env();
  await r2().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
    }),
  );
  return { key: args.key, url: publicUrl(args.key) };
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: r2Env().R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

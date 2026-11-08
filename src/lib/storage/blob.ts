import { createHash } from "node:crypto";
import { BlobNotFoundError, head, put } from "@vercel/blob";
import { blobEnv } from "@/lib/env";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Identical content shares a pathname and a cache entry. */
export function documentKey(sha256: string): string {
  return `docs/${sha256}.pdf`;
}

export async function putObject(args: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<{ key: string; url: string; exists: boolean }> {
  const token = blobEnv().BLOB_READ_WRITE_TOKEN;
  try {
    const existing = await head(args.key, { token });
    return { key: args.key, url: existing.url, exists: true };
  } catch (error) {
    if (!(error instanceof BlobNotFoundError)) throw error;
  }

  const blob = await put(args.key, Buffer.from(args.body), {
    access: "public",
    token,
    contentType: args.contentType,
    addRandomSuffix: false,
    // Concurrent uploads at this content-hashed pathname have identical bytes.
    allowOverwrite: true,
    cacheControlMaxAge: 31536000,
  });
  return { key: blob.pathname, url: blob.url, exists: false };
}

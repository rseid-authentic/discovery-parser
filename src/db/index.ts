import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { dbEnv } from "@/lib/env";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | undefined;

/**
 * Lazily constructed Drizzle client over Neon's HTTP driver.
 * Nothing is read from the environment until the first call, so importing
 * this module during `next build` is safe.
 */
export function db(): Db {
  if (!cached) {
    const { DATABASE_URL } = dbEnv();
    cached = drizzle({ client: neon(DATABASE_URL), schema });
  }
  return cached;
}

export { schema };

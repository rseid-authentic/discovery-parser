import { defineConfig } from "drizzle-kit";

// drizzle-kit reads DATABASE_URL from the shell. Load .env.local first:
//   set -a; source .env.local; set +a; pnpm db:push
// or prefix: `DATABASE_URL=... pnpm db:push`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://missing:missing@localhost:5432/missing",
  },
  strict: true,
  verbose: true,
});

import { EnvelopeSchema } from "../schema/envelope";

/** Runs must be ordered newest first. Prefer an actually readable success. */
export function selectRun<T extends { schemaValid: boolean; output: unknown }>(runs: T[]): T | undefined {
  return runs.find((run) => run.schemaValid && EnvelopeSchema.safeParse(run.output).success) ?? runs[0];
}

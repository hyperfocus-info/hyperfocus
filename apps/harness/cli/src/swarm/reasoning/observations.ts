import type { ExecutionResult } from "@hyperfocus/ai-core/swarm";
import { evidenceExcerpt as observationExcerpt } from "../execution/investigation-summary";
export { evidenceExcerpt as observationExcerpt } from "../execution/investigation-summary";

/** Bound payload fields before serialization so status and paging metadata survive. */
export function commandObservation(result: ExecutionResult) {
  return JSON.stringify({ ...result, stdout: observationExcerpt(result.stdout, 3_000), stderr: observationExcerpt(result.stderr, 2_000),
    stdoutOmittedCharacters: Math.max(0, result.stdout.length - 3_000), stderrOmittedCharacters: Math.max(0, result.stderr.length - 2_000) });
}

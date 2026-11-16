import { qualityEligibility } from "./rules";
import { qualityCoverage } from "./report";
import { qualityTraceSchema } from "./contracts";

/** A host completion gate, not a parser of the model's claims. Legacy records remain readable. */
export function qualityCompletionBlock(input: { intent: string; paths?: readonly string[]; trace?: unknown; runId?: string }) {
  const expected = qualityEligibility({ intent: input.intent, paths: input.paths }).rules
    .filter(rule => rule.eligible === "yes" && rule.definition.severity === "blocking");
  if (!input.trace) return expected.length ? "Required UI quality evidence is missing." : undefined;
  const parsed = qualityTraceSchema.safeParse(input.trace);
  if (!parsed.success) return "Quality evidence is invalid; completion cannot verify it.";
  if (input.runId && parsed.data.runId !== input.runId) return "Quality evidence belongs to another run; fresh verification is required.";
  if (expected.some(rule => !parsed.data.rules.some(actual => actual.id === rule.definition.id && actual.eligible === "yes" && actual.severity === "blocking"
    && rule.definition.verifierIds.every(id => actual.verifierIds.includes(id))))) return "Applicable mandatory rules or verifiers were omitted from the quality trace.";
  if (!parsed.data.rules.some(rule => rule.eligible !== "no" && rule.severity === "blocking")) return undefined;
  const report = qualityCoverage(parsed.data);
  return report.state === "VERIFIED" ? undefined : "Mandatory design/experience checks have not all passed; inspect Quality verification.";
}

import { z } from "zod";

const id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:+-]+$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
// References, never arbitrary prompt/tool output. No URLs, queries or credentials.
const ref = z.string().min(1).max(500).regex(/^[a-zA-Z0-9_./:# -]+$/).refine(value => !value.split(/[\/]/).includes(".."));
export const qualityRuleRefSchema = z.object({ id, version: id, sha256: hash }).strict();
export type QualityRuleRef = z.infer<typeof qualityRuleRefSchema>;
export const qualityRuleSchema = qualityRuleRefSchema.extend({
  source: ref, category: z.enum(["structural", "behavioral", "geometric", "qualitative"]),
  scope: id, severity: z.enum(["blocking", "advisory"]), verifierIds: z.array(id).max(8),
  eligible: z.enum(["yes", "no", "unknown"]), rationale: z.string().max(500),
}).strict();
export type QualityRule = z.infer<typeof qualityRuleSchema>;
export const qualityHandoffSchema = z.object({
  schema: z.literal("hyperfocus-quality-handoff-v1"), taskId: id, parentAgentId: id, childAgentId: id,
  intentRef: ref, audienceRef: ref.optional(), journeyRefs: z.array(ref).max(16),
  requiredRules: z.array(qualityRuleRefSchema).max(64), compositionIds: z.array(id).max(16),
  acceptedDecisionIds: z.array(id).max(16), verificationProfileId: id,
}).strict();
export type QualityHandoff = z.infer<typeof qualityHandoffSchema>;
export const qualityEventSchema = z.object({
  sequence: z.number().int().nonnegative(), agentId: id,
  stage: z.enum(["eligibility", "selection", "context-delivery", "handoff", "implementation", "verification", "acceptance"]),
  outcome: z.enum(["eligible", "ineligible", "selected", "delivered", "passed", "failed", "skipped", "blocked", "unknown"]),
  ruleId: id.optional(), verifierId: id.optional(), childAgentId: id.optional(),
  ruleSha256: hash.optional(), candidateSha256: hash.optional(),
  boundary: z.enum(["host-assembly", "sdk-prompt", "cli-stdin", "unsupported", "host-verifier", "human-review"]).optional(),
  reason: z.string().min(1).max(500), evidenceRefs: z.array(ref).max(16),
  timestamp: z.string().datetime(), durationMs: z.number().nonnegative().optional(),
}).strict();
export type QualityEvent = z.infer<typeof qualityEventSchema>;
export const qualityTraceSchema = z.object({
  schema: z.literal("hyperfocus-quality-trace-v1"), runId: id, taskId: id,
  profile: z.enum(["implementation", "prototype"]), intentSha256: hash,
  rules: z.array(qualityRuleSchema).max(64), handoffs: z.array(qualityHandoffSchema).max(64),
  events: z.array(qualityEventSchema).max(4096), limitations: z.array(z.string().max(500)).max(16),
}).strict().superRefine((trace, context) => {
  if (new Set(trace.rules.map(rule => rule.id)).size !== trace.rules.length) context.addIssue({ code: "custom", message: "Conflicting rule identities." });
  if (trace.events.some((event, index) => event.sequence !== index)) context.addIssue({ code: "custom", message: "Quality event sequence is incomplete or duplicated." });
  const agents = new Set(["main"]);
  for (const handoff of trace.handoffs) {
    if (handoff.taskId !== trace.taskId || !agents.has(handoff.parentAgentId) || agents.has(handoff.childAgentId)) context.addIssue({ code: "custom", message: "Quality handoff ownership is inconsistent." });
    agents.add(handoff.childAgentId);
  }
});
export type QualityTrace = z.infer<typeof qualityTraceSchema>;
export type QualityEventInput = Omit<QualityEvent, "sequence" | "timestamp">;

export function appendQualityEvent(trace: QualityTrace, input: QualityEventInput) {
  if (trace.events.length >= 4096) throw new Error("Quality trace capacity reached; cannot discard mandatory evidence.");
  const event = qualityEventSchema.parse({ ...input, sequence: trace.events.length, timestamp: new Date().toISOString() });
  trace.events.push(event);
  return event;
}

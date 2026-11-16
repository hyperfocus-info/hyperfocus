import { qualityHandoffSchema, type QualityHandoff, type QualityRule, type QualityRuleRef } from "./contracts";

export function ruleReference(rule: QualityRule): QualityRuleRef { return { id: rule.id, version: rule.version, sha256: rule.sha256 }; }

export function validateQualityHandoff(input: unknown, expected: readonly QualityRuleRef[], available: readonly QualityRuleRef[], purpose?: QualityHandoff) {
  const parsed = qualityHandoffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reasons: ["Invalid versioned quality handoff envelope."] };
  const reasons: string[] = [];
  if (purpose) {
    for (const field of ["intentRef", "audienceRef", "verificationProfileId"] as const) {
      if (parsed.data[field] !== purpose[field]) reasons.push(`Handoff purpose mismatch: ${field}`);
    }
    for (const field of ["journeyRefs", "compositionIds", "acceptedDecisionIds"] as const) {
      for (const obligation of purpose[field]) {
        if (!parsed.data[field].includes(obligation)) reasons.push(`Handoff purpose omitted: ${field}:${obligation}`);
      }
    }
  }
  const seen = new Set<string>();
  for (const reference of parsed.data.requiredRules) {
    if (seen.has(reference.id)) reasons.push(`Conflicting duplicate rule: ${reference.id}`);
    seen.add(reference.id);
    const resolved = available.find(rule => rule.id === reference.id);
    if (!resolved) reasons.push(`Missing rule content: ${reference.id}`);
    else if (resolved.version !== reference.version || resolved.sha256 !== reference.sha256) reasons.push(`Stale rule reference: ${reference.id}`);
  }
  for (const rule of expected) {
    const attached = parsed.data.requiredRules.find(reference => reference.id === rule.id);
    if (!attached) reasons.push(`Mandatory invariant not propagated: ${rule.id}`);
    else if (attached.version !== rule.version || attached.sha256 !== rule.sha256) reasons.push(`Conflicting obligation: ${rule.id}`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function createQualityHandoff(input: Omit<QualityHandoff, "schema">): QualityHandoff {
  return qualityHandoffSchema.parse({ schema: "hyperfocus-quality-handoff-v1", ...input });
}

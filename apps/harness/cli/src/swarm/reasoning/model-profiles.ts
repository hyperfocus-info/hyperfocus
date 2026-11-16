import { swarmModelProfilesSchema, type SwarmModelProfiles } from "@hyperfocus/ai-core/swarm";
import type { CodexSubscriptionStatus } from "@hyperfocus/ai-runtime";

/** Account access is verified separately by real subscription calls before admission. */
export function swarmSubscriptionProfiles(value?: string): SwarmModelProfiles {
  const highest = { agentId: "codex-cli", providerId: "codex-account", modelId: "gpt-6-astra", reasoning: "xhigh" };
  const profiles = swarmModelProfilesSchema.parse(value ? JSON.parse(value) : {
    planning: highest, implementation: { ...highest, modelId: "gpt-6.1-sol", reasoning: "high" }, review: highest,
  });
  for (const profile of Object.values(profiles)) {
    if (profile.agentId !== "codex-cli" || profile.providerId !== "codex-account")
      throw Error("This host permits only Codex subscription profiles; paid API fallback is disabled.");
  }
  return profiles;
}

export function swarmWeeklyQuotaWindow(status: CodexSubscriptionStatus) {
  const windows = [status.limits?.primary, status.limits?.secondary]
    .filter(window => window && (window.windowDurationMins ?? 0) >= 10_080);
  const window = windows.sort((a, b) => (b!.usedPercent - a!.usedPercent))[0];
  if (!window || window.resetsAt === undefined || window.windowDurationMins === undefined)
    throw Error("Codex weekly allowance metadata is unavailable; the configured weekly ceiling cannot be enforced.");
  return { usedPercent: window.usedPercent, resetsAt: window.resetsAt, windowDurationMins: window.windowDurationMins };
}

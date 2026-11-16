import { z } from "zod";
import { aiReasoningEffortSchema, chooseAvailableAiProfile, type AiExecutionProfile, type AiRuntimeCatalog } from "./contracts";

/** Machine-user defaults only. Credentials and app execution policy stay host-owned. */
export const sharedAiPreferencesSchema = z.preprocess((value) => {
  // Retired context switch: old files remain readable, but never control task intent.
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "designGuidance"));
  }
  return value;
}, z.object({
  version: z.literal(1),
  providerId: z.enum(["openai", "google", "anthropic"]).optional(),
  reasoning: aiReasoningEffortSchema.optional()
}).strict());

export type SharedAiPreferences = z.infer<typeof sharedAiPreferencesSchema>;

export function applySharedAiPreferences(options: {
  catalog: AiRuntimeCatalog;
  preferred?: AiExecutionProfile;
  preferences: SharedAiPreferences;
}): AiExecutionProfile | undefined {
  const { catalog, preferred } = options;
  const preferences = sharedAiPreferencesSchema.parse(options.preferences);
  if (preferred) return chooseAvailableAiProfile({ catalog, preferred, approvalPolicy: "never" });
  const providerId = preferences.providerId ?? "openai";
  const providerProfile = chooseAvailableAiProfile({
    catalog: {
      ...catalog,
      agents: catalog.agents.filter(agent => agent.providerIds.includes(providerId)),
      providers: catalog.providers.filter(provider => provider.id === providerId)
    },
    approvalPolicy: "never"
  });
  const baseline = providerProfile ?? chooseAvailableAiProfile({ catalog, approvalPolicy: "never" });
  if (!baseline) return undefined;
  return chooseAvailableAiProfile({
    catalog,
    preferred: { ...baseline, reasoning: preferences.reasoning ?? baseline.reasoning },
    approvalPolicy: "never"
  });
}

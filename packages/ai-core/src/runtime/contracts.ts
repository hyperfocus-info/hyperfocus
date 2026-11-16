import { z } from "zod";
import { qualityTraceSchema } from "../quality/contracts";

const idSchema = z.string().trim().min(1).max(160);
const labelSchema = z.string().trim().min(1).max(240);
const boundedJsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string().max(200_000),
    z.array(boundedJsonSchema).max(10_000),
    z.record(z.string().max(200), boundedJsonSchema)
  ])
);

export const aiReasoningEffortSchema = z.enum([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
]);

export const aiApprovalPolicySchema = z.enum(["never", "on-request"]);

export const aiExecutionProfileSchema = z
  .object({
    id: idSchema.optional(),
    label: labelSchema.optional(),
    agentId: idSchema,
    providerId: idSchema,
    modelId: idSchema,
    reasoning: aiReasoningEffortSchema.optional(),
    webSearch: z.boolean().optional(),
    fastMode: z.boolean().optional(),
    approvalPolicy: aiApprovalPolicySchema.default("never")
  })
  .strict();

export type AiExecutionProfile = z.infer<typeof aiExecutionProfileSchema>;

export const aiAgentDescriptorSchema = z
  .object({
    id: idSchema,
    label: labelSchema,
    description: z.string().max(1_000).optional(),
    providerIds: z.array(idSchema).max(256),
    supportsReasoning: z.boolean(),
    supportsStructuredOutput: z.boolean(),
    reasoningEfforts: z.array(aiReasoningEffortSchema).min(1).max(5).optional(),
    supportsWebSearch: z.boolean().optional(),
    usageReporting: z.enum(["reported", "unavailable"]).optional(),
    available: z.boolean(),
    unavailableReason: z.string().max(1_000).optional()
  })
  .strict();

export const aiProviderDescriptorSchema = z
  .object({
    id: idSchema,
    label: labelSchema,
    authenticated: z.boolean(),
    credentialSource: z.enum(["stored", "environment", "ambient", "missing"]),
    modelIds: z.array(idSchema).max(10_000),
    defaultModelId: idSchema.optional()
  })
  .strict();

export const aiModelDescriptorSchema = z
  .object({
    id: idSchema,
    providerId: idSchema,
    label: labelSchema,
    contextWindow: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    reasoning: z.boolean(),
    input: z.array(z.enum(["text", "image"])).min(1).max(2)
  })
  .strict();

export const aiRuntimeCatalogSchema = z
  .object({
    agents: z.array(aiAgentDescriptorSchema).max(64),
    providers: z.array(aiProviderDescriptorSchema).max(256),
    models: z.array(aiModelDescriptorSchema).max(10_000),
    credentialPersistence: z.enum(["windows-dpapi", "memory-only"]).optional()
  })
  .strict();

export type AiAgentDescriptor = z.infer<typeof aiAgentDescriptorSchema>;
export type AiProviderDescriptor = z.infer<typeof aiProviderDescriptorSchema>;
export type AiModelDescriptor = z.infer<typeof aiModelDescriptorSchema>;
export type AiRuntimeCatalog = z.infer<typeof aiRuntimeCatalogSchema>;

export interface ChooseAvailableAiProfileOptions {
  catalog: AiRuntimeCatalog;
  preferred?: AiExecutionProfile;
  approvalPolicy?: AiExecutionProfile["approvalPolicy"];
}

export interface GetAiProfileReasoningOptionsOptions {
  catalog: AiRuntimeCatalog;
  profile: Pick<AiExecutionProfile, "agentId" | "providerId" | "modelId">;
}

export const aiChatMessageSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("user"), content: z.string().min(1).max(1_000_000) }).strict(),
  z.object({ role: z.literal("assistant"), content: z.string().min(1).max(1_000_000) }).strict()
]);

export const aiRunRequestSchema = z
  .object({
    qualityIntent: z.string().max(16000).optional(),
    requestId: idSchema,
    profile: aiExecutionProfileSchema,
    deadlineAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    systemPrompt: z.string().max(200_000).optional(),
    messages: z.array(aiChatMessageSchema).min(1).max(256),
    maxOutputTokens: z.number().int().min(64).max(128_000).optional(),
    temperature: z.number().min(0).max(2).optional()
  })
  .strict();

export type AiRunRequest = z.infer<typeof aiRunRequestSchema>;

export const aiRunResultSchema = z
  .object({
    quality: qualityTraceSchema.optional(),
    requestId: idSchema,
    profile: aiExecutionProfileSchema,
    text: z.string().max(2_000_000),
    stopReason: z.enum(["stop", "length", "toolUse", "error", "aborted"]),
    errorMessage: z.string().max(4_000).optional(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        costUsd: z.number().finite().nonnegative().optional(),
        costSource: z.enum(["estimated", "reported"]).optional()
      })
      .strict()
      .optional(),
    usageStatus: z.enum(["reported", "unavailable"]).optional()
  })
  .strict();

export type AiRunResult = z.infer<typeof aiRunResultSchema>;

export const appActionDefinitionSchema = z
  .object({
    id: idSchema,
    label: labelSchema,
    description: z.string().min(1).max(2_000),
    inputSchema: z.record(z.string(), boundedJsonSchema),
    supportsBulk: z.boolean().default(false),
    mutates: z.boolean().default(true)
  })
  .strict();

export type AppActionDefinition = z.infer<typeof appActionDefinitionSchema>;

export const appActionCallSchema = z
  .object({
    id: idSchema,
    input: z.record(z.string(), boundedJsonSchema)
  })
  .strict();

export const appActionPlanSchema = z
  .object({
    schema: z.literal("hyperfocus-app-action-plan-v1"),
    requestId: idSchema,
    intent: z.string().min(1).max(2_000),
    baseRevision: z.number().int().nonnegative(),
    atomic: z.boolean().default(true),
    actions: z.array(appActionCallSchema).min(1).max(1_000)
  })
  .strict();

export type AppActionCall = z.infer<typeof appActionCallSchema>;
export type AppActionPlan = z.infer<typeof appActionPlanSchema>;

export const appActionHandoffSchema = z
  .object({
    schema: z.literal("hyperfocus-app-action-handoff-v1"),
    requestId: idSchema,
    baseRevision: z.number().int().nonnegative(),
    resultingRevision: z.number().int().nonnegative(),
    status: z.enum(["previewed", "applied", "rejected", "stale", "failed"]),
    summary: z.string().min(1).max(4_000),
    actionResults: z
      .array(
        z
          .object({
            index: z.number().int().nonnegative(),
            status: z.enum(["ready", "applied", "rejected", "failed"]),
            message: z.string().max(2_000).optional()
          })
          .strict()
      )
      .max(1_000)
  })
  .strict();

export type AppActionHandoff = z.infer<typeof appActionHandoffSchema>;

export function assertProfileAvailable(
  catalog: AiRuntimeCatalog,
  profile: AiExecutionProfile
): void {
  const agent = catalog.agents.find((candidate) => candidate.id === profile.agentId);
  if (!agent?.available) {
    throw new Error(`AI agent '${profile.agentId}' is unavailable.`);
  }
  if (!agent.providerIds.includes(profile.providerId)) {
    throw new Error(
      `AI agent '${profile.agentId}' does not support provider '${profile.providerId}'.`
    );
  }
  const provider = catalog.providers.find((candidate) => candidate.id === profile.providerId);
  if (!provider) {
    throw new Error(`AI provider '${profile.providerId}' is unavailable.`);
  }
  if (!provider.modelIds.includes(profile.modelId)) {
    throw new Error(
      `AI model '${profile.modelId}' is not available from provider '${profile.providerId}'.`
    );
  }
  const model = catalog.models.find(
    (candidate) => candidate.providerId === provider.id && candidate.id === profile.modelId
  );
  if (!model) {
    throw new Error(`AI model '${profile.modelId}' has no catalog descriptor.`);
  }
  const reasoning = profile.reasoning ?? "minimal";
  if (!getAiProfileReasoningOptions({ catalog, profile }).includes(reasoning)) {
    throw new Error(
      `AI agent '${profile.agentId}' and model '${profile.modelId}' do not support reasoning '${reasoning}'.`
    );
  }
  if (profile.webSearch && !agent.supportsWebSearch) {
    throw new Error(`AI agent '${profile.agentId}' does not support web search.`);
  }
}

const allReasoningEfforts = ["minimal", "low", "medium", "high", "xhigh"] as const;

export function getAiAgentReasoningEfforts(agent: AiAgentDescriptor) {
  return agent.reasoningEfforts?.length
    ? [...agent.reasoningEfforts]
    : agent.supportsReasoning
      ? [...allReasoningEfforts]
      : ["minimal" as const];
}

export function getAiProfileReasoningOptions({
  catalog,
  profile
}: GetAiProfileReasoningOptionsOptions) {
  const agent = catalog.agents.find((candidate) => candidate.id === profile.agentId);
  const model = catalog.models.find(
    (candidate) => candidate.providerId === profile.providerId && candidate.id === profile.modelId
  );
  if (!agent || !model) return [];
  return model.reasoning ? getAiAgentReasoningEfforts(agent) : ["minimal" as const];
}

export function chooseAvailableAiProfile({
  catalog,
  preferred,
  approvalPolicy
}: ChooseAvailableAiProfileOptions): AiExecutionProfile | undefined {
  const agents = catalog.agents.filter((candidate) => candidate.available)
    .sort((a, b) => Number(b.id === preferred?.agentId) - Number(a.id === preferred?.agentId));
  for (const agent of agents) {
    const providers = catalog.providers.filter((candidate) => agent.providerIds.includes(candidate.id))
      .sort((a, b) => Number(b.id === preferred?.providerId) - Number(a.id === preferred?.providerId)
        || Number(b.authenticated) - Number(a.authenticated));
    for (const provider of providers) {
      const preferredModel = catalog.models.find(
        (candidate) =>
          candidate.providerId === provider.id &&
          candidate.id === preferred?.modelId &&
          provider.modelIds.includes(candidate.id)
      );
      const described = catalog.models.filter(candidate => candidate.providerId === provider.id && provider.modelIds.includes(candidate.id));
      const declared = described.find(candidate => candidate.id === provider.defaultModelId);
      const model = preferredModel ?? declared ?? (described.length === 1 ? described[0] : undefined);
      if (!model) continue;

      const reasoningOptions = getAiProfileReasoningOptions({
        catalog,
        profile: { agentId: agent.id, providerId: provider.id, modelId: model.id }
      });
      const preferredReasoning = preferred?.reasoning ?? "minimal";
      const reasoning = reasoningOptions.includes(preferredReasoning)
        ? preferredReasoning
        : reasoningOptions[0];
      if (!reasoning) continue;

      return {
        agentId: agent.id,
        providerId: provider.id,
        modelId: model.id,
        reasoning,
        webSearch: Boolean(preferred?.webSearch && agent.supportsWebSearch),
        fastMode: preferred?.fastMode,
        approvalPolicy: approvalPolicy ?? preferred?.approvalPolicy ?? "never"
      };
    }
  }
  return undefined;
}

/** UI configuration only: an empty model requires explicit selection before execution. */
export function chooseAiProfileConfiguration(options: ChooseAvailableAiProfileOptions): AiExecutionProfile | undefined {
  const { catalog, preferred } = options;
  const agent = catalog.agents.find(item => item.available && item.id === preferred?.agentId)
    ?? catalog.agents.find(item => item.available && item.providerIds.some(id => catalog.providers.some(provider => provider.id === id && provider.modelIds.length)));
  if (!agent) return undefined;
  const providers = catalog.providers.filter(item => agent.providerIds.includes(item.id) && item.modelIds.some(id => catalog.models.some(model => model.providerId === item.id && model.id === id)));
  const provider = providers.find(item => item.id === preferred?.providerId) ?? providers.find(item => item.authenticated) ?? providers[0];
  if (!provider) return undefined;
  const profile = chooseAvailableAiProfile({ ...options, catalog: { ...catalog, agents: [agent], providers: [provider] } });
  return profile ?? { agentId: agent.id, providerId: provider.id, modelId: "", approvalPolicy: options.approvalPolicy ?? "never" };
}

export function assertAiRuntimeCatalogConsistent(catalog: AiRuntimeCatalog): void {
  const providers = new Map(catalog.providers.map((provider) => [provider.id, provider]));
  const models = new Map<string, Set<string>>();
  for (const model of catalog.models) {
    let ids = models.get(model.providerId);
    if (!ids) models.set(model.providerId, ids = new Set());
    ids.add(model.id);
  }
  // Validate the graph once, independently of current installation/auth state.
  // Availability is an execution-profile check, not a catalog invariant.
  for (const provider of catalog.providers) {
    const ids = models.get(provider.id);
    for (const modelId of provider.modelIds) {
      if (!ids?.has(modelId)) throw new Error(`AI provider '${provider.id}' references missing model '${modelId}'.`);
    }
  }
  for (const agent of catalog.agents) {
    const reasoningEfforts = getAiAgentReasoningEfforts(agent);
    if (!agent.supportsReasoning && reasoningEfforts.some((effort) => effort !== "minimal")) {
      throw new Error(`AI agent '${agent.id}' offers unsupported reasoning profiles.`);
    }
    for (const providerId of agent.providerIds) {
      if (!providers.has(providerId)) throw new Error(`AI agent '${agent.id}' references missing provider '${providerId}'.`);
    }
  }
}

import { z } from "zod";

import {
  agentRuntimeCapabilitySchema,
  providerCapabilitySchema
} from "./conversation";
import {
  autoCompactContextThresholdPercentSchema,
  backgroundJobApprovalPolicySchema,
  correctnessIterationModeSchema,
  dirtyGitChangeLimitSchema,
  planExecutionModeSchema,
  providerBrandSchema,
  setupActionKindSchema,
  setupCheckStatusSchema,
  setupLaunchModeSchema,
  subagentWorktreeStrategySchema
} from "./shared";

export const executionControlStateSchema = z.object({
  isPaused: z.boolean(),
  deferredPlanningQuestionCount: z.number().int().min(0).max(100000),
  deferredAssistantQuestionCount: z.number().int().min(0).max(100000),
  deferredBrowserApprovalCount: z.number().int().min(0).max(100000)
});

export const setupActionSchema = z.object({
  kind: setupActionKindSchema,
  label: z.string().min(1).max(128),
  value: z.string().min(1).max(4096).optional()
});

export const setupCheckSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(256),
  summary: z.string().min(1).max(1024),
  detail: z.string().min(1).max(4000).optional(),
  status: setupCheckStatusSchema,
  requiredForFirstTask: z.boolean(),
  updatedAt: z.string().datetime().or(z.string().min(1)),
  primaryAction: setupActionSchema.optional(),
  secondaryAction: setupActionSchema.optional(),
  docsUrl: z.string().url().optional()
});

export const setupStateSchema = z.object({
  launchMode: setupLaunchModeSchema,
  updatedAt: z.string().datetime().or(z.string().min(1)),
  readyRequiredCount: z.number().int().min(0).max(1000),
  totalRequiredCount: z.number().int().min(0).max(1000),
  checks: z.array(setupCheckSchema).max(32)
});

export const runModelPreferenceSchema = z.enum(["inference", "intelligence"]);
export const assistantMaxCongestionDefaultSchema = z.number().min(0.25).max(3);
export const maxBackgroundJobsDefaultSchema = z.number().int().min(5).max(100);

export const preferencesStateSchema = z.object({
  hasUsableApiKey: z.boolean(),
  hasStoredApiKey: z.boolean(),
  hasUsableOpenAiApiKey: z.boolean(),
  hasStoredOpenAiApiKey: z.boolean(),
  hasUsableGoogleApiKey: z.boolean(),
  hasStoredGoogleApiKey: z.boolean(),
  hasUsableAnthropicApiKey: z.boolean().default(false),
  hasStoredAnthropicApiKey: z.boolean().default(false),
  providerBrand: providerBrandSchema,
  debugEnabledDefault: z.boolean(),
  tracePanelDefaultOpen: z.boolean(),
  subagentWorktreeStrategyDefault: subagentWorktreeStrategySchema,
  blockChatOnDirtyGitDefault: z.boolean(),
  dirtyGitChangeLimitDefault: dirtyGitChangeLimitSchema,
  autoCompactContextThresholdPercentDefault: autoCompactContextThresholdPercentSchema,
  planExecutionModeDefault: planExecutionModeSchema,
  planExecutionDelaySecondsDefault: z.number().int().min(0).max(300),
  singleAgentModelPreferenceDefault: runModelPreferenceSchema.default("intelligence"),
  subagentModelPreferenceDefault: runModelPreferenceSchema.default("inference"),
  correctnessIterationModeDefault: correctnessIterationModeSchema,
  backgroundJobApprovalPolicyDefault: backgroundJobApprovalPolicySchema,
  assistantAutoApproveNonBlockingQuestionsDefault: z.boolean().default(true),
  assistantCongestionControlEnabledDefault: z.boolean().optional(),
  assistantMaxCongestionDefault: assistantMaxCongestionDefaultSchema.optional(),
  maxBackgroundJobsDefault: maxBackgroundJobsDefaultSchema.default(10),
  autoArchiveCompletedThreadsDefault: z.boolean().optional(),
  memoryBankEnabledDefault: z.boolean(),
  memoryBankRecordRunsDefault: z.boolean().default(false),
  checkCliUpdatesDefault: z.boolean().default(true),
  attachmentsEnabled: z.boolean(),
  capabilities: z.array(providerCapabilitySchema).max(4),
  agentRuntimes: z.array(agentRuntimeCapabilitySchema).max(8)
});

export const providerConnectionProviderSchema = z.enum(["openai", "google", "anthropic"]);
export const providerConnectionStatusSchema = z.enum(["ready", "failed"]);

export type RunModelPreference = z.infer<typeof runModelPreferenceSchema>;
export type ExecutionControlState = z.infer<typeof executionControlStateSchema>;
export type SetupAction = z.infer<typeof setupActionSchema>;
export type SetupCheck = z.infer<typeof setupCheckSchema>;
export type SetupState = z.infer<typeof setupStateSchema>;
export type PreferencesState = z.infer<typeof preferencesStateSchema>;

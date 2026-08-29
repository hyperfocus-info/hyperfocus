import {
  createAssistantLogEntryId,
  type Assistant,
  type AssistantAssetRef,
  type BackgroundJob,
  type BackgroundJobsState,
  type AssistantsState,
  type ComposerReasoningStrength,
  type ProviderBrand
} from "@hyperfocus/ai-core/protocol";
import { type WorkspaceRepository } from "./workspace-repository";

export type AssistantFactoryLaunchDefaults = {
  providerBrand: ProviderBrand;
  planningModelId?: string;
  executionModelId?: string;
  reasoningStrength?: ComposerReasoningStrength;
  fastMode?: boolean;
  modeId?: string;
};

export type AssistantFactoryEvents = {
  assistantsUpdated?: (state: AssistantsState) => void;
  assistantCreatedCard?: (assistant: Assistant) => void;
  backgroundJobsUpdated?: (state: BackgroundJobsState) => void;
};

export type AssistantFactoryInput = {
  repository: WorkspaceRepository;
  assistant: Assistant;
  assetRefs?: AssistantAssetRef[];
  jobs?: BackgroundJob[];
  launchDefaults: AssistantFactoryLaunchDefaults;
  emit?: AssistantFactoryEvents;
};

type AssistantJobBootstrapOptions = {
  confirmation?: { questionId: string; answerText: string };
};

export function createOrUpdateAssistantWithJobs(input: AssistantFactoryInput) {
  const existing = input.repository.getAssistant(input.assistant.id, true);
  const assistant = input.repository.saveAssistant(
    {
      ...input.assistant,
      providerBrand: input.assistant.providerBrand ?? input.launchDefaults.providerBrand,
      reasoningStrength: input.assistant.reasoningStrength ?? input.launchDefaults.reasoningStrength,
      fastMode: input.assistant.fastMode ?? input.launchDefaults.fastMode ?? false,
      modeId: input.assistant.modeId ?? input.launchDefaults.modeId,
      executionModelId: input.assistant.executionModelId ?? input.launchDefaults.executionModelId
    },
    input.assetRefs ?? []
  );
  return persistAssistantFactoryResult(input, assistant, !existing);
}

export function bootstrapAssistantJobsIfNone(input: AssistantFactoryInput, options: AssistantJobBootstrapOptions = {}) {
  const assistant = input.repository.getAssistant(input.assistant.id, true) ?? input.assistant;
  const jobs = (input.jobs ?? []).map((job) => attachAssistantLaunchProfile(job, assistant, input.launchDefaults));
  const result = input.repository.saveAssistantJobBootstrap({
    assistantId: assistant.id,
    jobs,
    logEntry: createAssistantFactoryLogEntry(assistant, jobs, false, input.launchDefaults),
    confirmation: options.confirmation
  });
  if (result) {
    input.emit?.assistantsUpdated?.(input.repository.loadAssistantSummaryDelta([result.assistant.id]));
    input.emit?.assistantCreatedCard?.(result.assistant);
    input.emit?.backgroundJobsUpdated?.(result.backgroundJobsState);
  }
  return result;
}

function persistAssistantFactoryResult(input: AssistantFactoryInput, assistant: Assistant, created: boolean) {
  const savedJobs: BackgroundJob[] = [];
  for (const job of input.jobs ?? []) {
    input.repository.saveBackgroundJob(attachAssistantLaunchProfile(job, assistant, input.launchDefaults));
    const savedJob = input.repository.getBackgroundJob(job.id);
    if (savedJob) savedJobs.push(savedJob);
  }
  input.repository.appendAssistantLogEntry(createAssistantFactoryLogEntry(assistant, savedJobs, created, input.launchDefaults));
  const backgroundJobsState = input.repository.loadBackgroundJobsState();
  input.emit?.assistantsUpdated?.(input.repository.loadAssistantSummaryDelta([assistant.id]));
  input.emit?.assistantCreatedCard?.(assistant);
  input.emit?.backgroundJobsUpdated?.(backgroundJobsState);
  return { assistant, jobs: savedJobs, created, backgroundJobsState };
}

function createAssistantFactoryLogEntry(
  assistant: Assistant,
  jobs: BackgroundJob[],
  created: boolean,
  defaults: AssistantFactoryLaunchDefaults
) {
  return {
    id: createAssistantLogEntryId(), assistantId: assistant.id, level: "info" as const,
    summary: created ? "Assistant created" : "Assistant updated",
    detail: jobs.length > 0 ? `Persisted ${jobs.length} assistant-owned job(s).` : "Assistant state persisted.",
    detailsJson: { jobIds: jobs.map((job) => job.id), launchProfile: summarizeLaunchProfile(assistant, defaults) },
    createdAt: new Date().toISOString()
  };
}

export function attachAssistantLaunchProfile(
  job: BackgroundJob,
  assistant: Assistant,
  defaults: AssistantFactoryLaunchDefaults
): BackgroundJob {
  if (job.definition.kind !== "ai-routine" || job.assistantId !== assistant.id) {
    return job;
  }

  return {
    ...job,
    definition: {
      ...job.definition,
      modeId: job.definition.modeId ?? assistant.modeId ?? defaults.modeId,
      executionModelId: job.definition.executionModelId ?? assistant.executionModelId ?? defaults.executionModelId,
      reasoningStrength: job.definition.reasoningStrength ?? assistant.reasoningStrength ?? defaults.reasoningStrength,
      fastMode: job.definition.fastMode ?? assistant.fastMode ?? defaults.fastMode,
      launchProfile: {
        agentId: job.definition.launchProfile?.agentId ?? assistant.agentId,
        providerBrand: job.definition.launchProfile?.providerBrand ?? assistant.providerBrand ?? defaults.providerBrand,
        planningModelId: job.definition.launchProfile?.planningModelId ?? defaults.planningModelId,
        executionModelId:
          job.definition.launchProfile?.executionModelId ??
          job.definition.executionModelId ??
          assistant.executionModelId ??
          defaults.executionModelId,
        reasoningStrength:
          job.definition.launchProfile?.reasoningStrength ??
          job.definition.reasoningStrength ??
          assistant.reasoningStrength ??
          defaults.reasoningStrength,
        fastMode: job.definition.launchProfile?.fastMode ?? job.definition.fastMode ?? assistant.fastMode ?? defaults.fastMode,
        modeId: job.definition.launchProfile?.modeId ?? job.definition.modeId ?? assistant.modeId ?? defaults.modeId
      }
    }
  };
}

function summarizeLaunchProfile(assistant: Assistant, defaults: AssistantFactoryLaunchDefaults) {
  return {
    agentId: assistant.agentId,
    providerBrand: assistant.providerBrand ?? defaults.providerBrand,
    planningModelId: defaults.planningModelId,
    executionModelId: assistant.executionModelId ?? defaults.executionModelId,
    reasoningStrength: assistant.reasoningStrength ?? defaults.reasoningStrength,
    fastMode: assistant.fastMode ?? defaults.fastMode,
    modeId: assistant.modeId ?? defaults.modeId
  };
}

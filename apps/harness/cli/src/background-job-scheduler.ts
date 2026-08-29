import type { BackgroundJob, BackgroundJobApprovalPolicy, BackgroundJobRun, BackgroundJobRunStatus } from "@hyperfocus/ai-core/protocol";
import { getDueScheduleAdvance } from "./background-job-schedule";
import { assertAssistantRunnableForLaunch } from "./assistant-launch-gate";
import { debugLog } from "./logging";
import { classifyRunFailure, isBackoffEligibleFailureCategory } from "./run-failure-classification";
import { type WorkspaceRepository } from "./workspace-repository";

export const DEFAULT_BACKGROUND_RUN_MAX_MS = 30 * 60 * 1000;
export const DEFAULT_BACKGROUND_RUN_NO_PROGRESS_MS = 10 * 60 * 1000;

type BackgroundJobSchedulerOptions = {
  repository: WorkspaceRepository;
  intervalMs?: number;
  maxScheduledActiveRuns?: number;
  isRunLive?: (run: BackgroundJobRun) => boolean;
  onRunsTimingOut?: (runs: BackgroundJobRun[]) => Promise<void> | void;
  onRunsRepaired?: (runs: BackgroundJobRun[]) => Promise<void> | void;
  repairActiveRuns?: (now: Date) => Promise<BackgroundJobRun[]> | BackgroundJobRun[];
  onRunQueued?: (run: BackgroundJobRun, job: BackgroundJob) => Promise<void> | void;
  onTickFailed?: (error: unknown) => void;
};

type DueJob = {
  job: BackgroundJob;
  advance: ReturnType<typeof getDueScheduleAdvance>;
};

type AssistantCongestion = {
  congested: boolean;
  ratio: number;
};

export function createBackgroundJobScheduler(options: BackgroundJobSchedulerOptions) {
  const intervalMs = options.intervalMs ?? 15_000;
  let running = false;
  const { start, retry, stop } = createBackgroundJobSchedulerLoop(intervalMs, tick, options.onTickFailed);
  const {
    getRunsTimingOut,
    resolveAssistantCongestion,
    getActiveExclusiveAssistantRun,
    markActiveJob,
    markExclusiveAssistantJobBlocked,
    markSchedulerCapacityBlocked,
    queueDueJob,
    resolveCongestionDelay
  } = createBackgroundJobSchedulerInternals(options);

  async function tick(isStartup: boolean) {
    if (running) {
      return;
    }

    running = true;
    try {
      if (options.repository.getGlobalExecutionPaused()) {
        options.repository.setBackgroundSchedulerHeartbeat();
        return;
      }

      const now = new Date();
      const nowIso = now.toISOString();
      options.repository.setBackgroundSchedulerHeartbeat(now);

      const timingOutRuns = getRunsTimingOut(now);
      if (timingOutRuns.length > 0) {
        await options.onRunsTimingOut?.(timingOutRuns);
      }

      const repairedRuns = options.repairActiveRuns
        ? await options.repairActiveRuns(now)
        : options.repository.repairInterruptedBackgroundJobRuns({
            isRunLive: options.isRunLive,
            now,
            maxRunMs: DEFAULT_BACKGROUND_RUN_MAX_MS,
            noProgressMs: DEFAULT_BACKGROUND_RUN_NO_PROGRESS_MS
          });
      if (repairedRuns.length > 0) {
        await options.onRunsRepaired?.(repairedRuns);
      }

      const jobs = readEnabledSchedulerJobs(options.repository);
      const congestionControlEnabled = options.repository.getAssistantCongestionControlEnabledDefault();
      const congestionByAssistant = congestionControlEnabled ? resolveAssistantCongestion(jobs) : new Map<string, AssistantCongestion>();
      const activeRuns = options.repository.getActiveBackgroundJobRuns();
      let scheduledActiveRunCount = countScheduledLaunchSlots(activeRuns);
      const maxScheduledActiveRuns =
        options.maxScheduledActiveRuns ?? options.repository.getMaxBackgroundJobsDefault();
      debugLog("background.scheduler.tick", {
        isStartup,
        enabledJobs: jobs.length,
        activeRuns: activeRuns.length,
        scheduledActiveRuns: scheduledActiveRunCount,
        maxScheduledActiveRuns,
        congestedAssistants: congestionControlEnabled
          ? [...congestionByAssistant.values()].filter((entry) => entry.congested).length
          : 0
      });

      for (const loadedJob of jobs) {
        const job = options.repository.repairBackgroundJobReferences(loadedJob.id) ?? loadedJob;
        if (job.status !== "enabled") {
          continue;
        }
        const advance = getDueScheduleAdvance(job.schedule, now);
        const activeRun = options.repository.getActiveBackgroundJobRuns(job.id)[0];
        const congestion = congestionControlEnabled && job.assistantId ? congestionByAssistant.get(job.assistantId) : undefined;
        const congested = congestionControlEnabled ? Boolean(congestion?.congested) : false;
        const congestionRatio = congestionControlEnabled ? congestion?.ratio : undefined;
        if (activeRun) {
          markActiveJob(job, activeRun, nowIso, congested, congestionRatio);
          continue;
        }
        const activeExclusiveAssistantRun = job.assistantId && job.lane === "exclusive"
          ? getActiveExclusiveAssistantRun(job.assistantId, jobs)
          : undefined;
        if (activeExclusiveAssistantRun) {
          markExclusiveAssistantJobBlocked(job, activeExclusiveAssistantRun, nowIso, congested, congestionRatio);
          continue;
        }

        if (job.assistantId) {
          try {
            assertAssistantRunnableForLaunch(options.repository, job.assistantId);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Assistant is not runnable";
            options.repository.updateBackgroundJobSchedulerState(job.id, {
              schedulerStatus: "blocked",
              schedulerDetail: message,
              blockedReason: message,
              schedulerCongested: congested,
              schedulerCongestionRatio: congestionRatio,
              lastSchedulerCheckAt: nowIso
            });
            continue;
          }
        }

        if (job.backoffUntil) {
          const backoffAt = Date.parse(job.backoffUntil);
          if (Number.isFinite(backoffAt) && backoffAt > now.getTime()) {
            options.repository.updateBackgroundJobSchedulerState(job.id, {
              schedulerStatus: "blocked",
              schedulerDetail: `Backoff until ${job.backoffUntil}`,
              blockedReason: `Failure backoff active until ${job.backoffUntil}`,
              consecutiveFailureCount: job.consecutiveFailureCount,
              backoffUntil: job.backoffUntil,
              lastFailureCategory: job.lastFailureCategory,
              schedulerCongested: congested,
              schedulerCongestionRatio: congestionRatio,
              lastSchedulerCheckAt: nowIso
            });
            continue;
          }
        }

        if (!advance.due) {
          options.repository.updateBackgroundJobSchedulerState(job.id, {
            schedulerStatus: "idle",
            schedulerDetail: advance.nextRunAt ? `Next run ${advance.nextRunAt}` : undefined,
            consecutiveFailureCount: job.consecutiveFailureCount,
            backoffUntil: job.backoffUntil,
            lastFailureCategory: job.lastFailureCategory,
            schedulerCongested: congested,
            schedulerCongestionRatio: congestionRatio,
            lastSchedulerCheckAt: nowIso
          });
          continue;
        }

        const congestionDelay = congested ? resolveCongestionDelay(job, now) : undefined;
        if (congestionDelay && congestionDelay.nextRunAt.getTime() > now.getTime()) {
          options.repository.updateBackgroundJobSchedule(job.id, {
            schedule: congestionDelay.schedule,
            nextRunAt: congestionDelay.nextRunAt.toISOString(),
            lastRunAt: job.lastRunAt
          });
          options.repository.updateBackgroundJobSchedulerState(job.id, {
            schedulerStatus: "idle",
            schedulerDetail: `Congested (${formatPercent(congestionRatio)}); scaled next run ${congestionDelay.nextRunAt.toISOString()}`,
            schedulerCongested: true,
            schedulerCongestionRatio: congestionRatio,
            lastSchedulerCheckAt: nowIso
          });
          debugLog("background.scheduler.congestion-delay", {
            jobId: job.id,
            assistantId: job.assistantId,
            isStartup,
            congestionRatio,
            nextRunAt: congestionDelay.nextRunAt.toISOString()
          });
          continue;
        }
        if (maxScheduledActiveRuns > 0 && scheduledActiveRunCount >= maxScheduledActiveRuns) {
          markSchedulerCapacityBlocked(job, nowIso, scheduledActiveRunCount, maxScheduledActiveRuns, congested, congestionRatio);
          continue;
        }
        const queuedRun = queueDueJob({ job, advance }, isStartup, nowIso, congested, congestionRatio);
        if (queuedRun && isScheduledLaunchSlot(queuedRun)) {
          scheduledActiveRunCount += 1;
        }
      }
    } finally {
      running = false;
    }
  }

  return { start, retry, stop, tick };
}

export type BackgroundJobScheduler = ReturnType<typeof createBackgroundJobScheduler>;

function createBackgroundJobSchedulerLoop(
  intervalMs: number,
  tick: (isStartup: boolean) => Promise<void>,
  onTickFailed: ((error: unknown) => void) | undefined
) {
  let timer: Timer | undefined;
  const scheduleTick = () => void tick(false).catch((error) => onTickFailed?.(error));
  function start() {
    if (timer) return;
    void tick(true).catch((error) => onTickFailed?.(error));
    timer = setInterval(scheduleTick, intervalMs);
  }
  async function retry() {
    timer ??= setInterval(scheduleTick, intervalMs);
    await tick(false);
  }
  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  }
  return { start, retry, stop };
}

function createBackgroundJobQueuer(options: BackgroundJobSchedulerOptions) {
  function queueDueJob(entry: DueJob, isStartup: boolean, nowIso: string, congested: boolean, congestionRatio?: number) {
    const { job, advance } = entry;
    options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "due",
      schedulerDetail: `Due at ${job.nextRunAt ?? advance.nextRunAt ?? nowIso}`,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    if (options.repository.getActiveBackgroundJobRuns(job.id)[0]) {
      return undefined;
    }

    const triggerSource = isStartup ? "startup-catchup" : "schedule";
    debugLog("background.scheduler.queue", {
      jobId: job.id,
      assistantId: job.assistantId,
      triggerSource,
      skippedOccurrences: advance.skippedOccurrenceCount,
      congested
    });
    options.repository.updateBackgroundJobSchedule(job.id, {
      schedule: advance.nextSchedule,
      nextRunAt: advance.nextRunAt,
      lastRunAt: nowIso
    });
    const approvalPolicy = options.repository.getBackgroundJobApprovalPolicyDefault();
    const queuedStatus = resolveQueuedStatus(job, approvalPolicy);
    const approvalSummary =
      queuedStatus === "awaiting-approval"
        ? formatBackgroundApprovalSummary(job, triggerSource, approvalPolicy)
        : undefined;
    const queuedRun = options.repository.createBackgroundJobRun({
      jobId: job.id,
      projectId: job.projectId,
      assistantId: job.assistantId,
      automationThreadId: job.automationThreadId,
      triggerSource,
      status: queuedStatus,
      riskLevel: job.riskLevel,
      approvalStatus: resolveApprovalStatus(job, approvalPolicy),
      skippedOccurrenceCount: advance.skippedOccurrenceCount,
      summary: approvalSummary
    });
    options.repository.appendBackgroundJobRunEvent(
      queuedRun.id,
      queuedRun.status === "awaiting-approval" ? "awaiting-approval" : "queued",
      queuedRun.status === "awaiting-approval" ? `Waiting for approval before launching ${job.name}` : `Queued ${job.name}`,
      [approvalSummary, advance.skippedOccurrenceCount > 0 ? `Skipped ${advance.skippedOccurrenceCount} missed occurrence(s).` : undefined]
        .filter(Boolean)
        .join(" ")
        || undefined
    );
    options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: queuedRun.status === "queued" ? "queued" : "blocked",
      schedulerDetail: queuedRun.status === "queued" ? `Queued run ${queuedRun.id}` : `Waiting for approval ${queuedRun.id}`,
      blockedReason: queuedRun.status === "queued" ? undefined : `Waiting for approval ${queuedRun.id}`,
      schedulerQueuePosition: 1,
      schedulerQueueReason: queuedRun.status === "queued" ? "Queue #1: launching now" : `Queue #1: waiting for approval ${queuedRun.id}`,
      schedulerActiveRunId: queuedRun.id,
      schedulerActiveRunStartedAt: queuedRun.startedAt,
      schedulerLastProgressAt: queuedRun.lastHeartbeatAt ?? queuedRun.updatedAt,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    const handleLaunchFailure = (error: unknown) => {
      const failureMessage = error instanceof Error ? error.message : "Unknown background job launch failure";
      const currentRun = options.repository.getBackgroundJobRun(queuedRun.id);
      if (currentRun?.timedOutAt && currentRun.status !== "queued" && currentRun.status !== "running") {
        options.repository.updateBackgroundJobSchedulerState(job.id, {
          schedulerStatus: "blocked",
          schedulerDetail: currentRun.failureMessage ?? failureMessage,
          blockedReason: currentRun.failureMessage ?? failureMessage,
          consecutiveFailureCount: options.repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
          backoffUntil: options.repository.getBackgroundJob(job.id)?.backoffUntil,
          lastFailureCategory: options.repository.getBackgroundJob(job.id)?.lastFailureCategory,
          schedulerCongested: congested,
          schedulerCongestionRatio: congestionRatio,
          lastSchedulerCheckAt: new Date().toISOString()
        });
        return;
      }
      const failureCategory = classifyRunFailure({ message: failureMessage });
      options.repository.setBackgroundJobRunStatus(queuedRun.id, "failed", {
        failureMessage,
        failureCategory
      });
      options.repository.appendBackgroundJobRunEvent(queuedRun.id, "failed", "Background run failed", failureMessage);
      if (isBackoffEligibleFailureCategory(failureCategory)) {
        options.repository.recordBackgroundJobFailure(job.id, failureCategory);
      } else {
        options.repository.clearBackgroundJobFailureTracking(job.id);
      }
      options.repository.updateBackgroundJobSchedulerState(job.id, {
        schedulerStatus: "blocked",
        schedulerDetail: failureMessage,
        blockedReason: failureMessage,
        consecutiveFailureCount: options.repository.getBackgroundJob(job.id)?.consecutiveFailureCount,
        backoffUntil: options.repository.getBackgroundJob(job.id)?.backoffUntil,
        lastFailureCategory: options.repository.getBackgroundJob(job.id)?.lastFailureCategory,
        schedulerCongested: congested,
        schedulerCongestionRatio: congestionRatio,
        lastSchedulerCheckAt: new Date().toISOString()
      });
    };
    try {
      void Promise.resolve(options.onRunQueued?.(queuedRun, job)).catch(
        handleLaunchFailure
      );
    } catch (error) {
      handleLaunchFailure(error);
    }
    return queuedRun;
  }

  return queueDueJob;
}
function createBackgroundJobSchedulerInternals(options: BackgroundJobSchedulerOptions) {
  const queueDueJob = createBackgroundJobQueuer(options);

  function getRunsTimingOut(now: Date) {
    return options.repository.getActiveBackgroundJobRuns().filter((run) => {
      if (run.status !== "running" || !options.isRunLive?.(run)) {
        return false;
      }
      return getRunAgeMs(run, now) >= DEFAULT_BACKGROUND_RUN_MAX_MS || getRunLastProgressAgeMs(run, now) >= DEFAULT_BACKGROUND_RUN_NO_PROGRESS_MS;
    });
  }

  function resolveAssistantCongestion(jobs: BackgroundJob[]) {
    const loadByAssistant = new Map<string, number>();
    for (const job of jobs) {
      if (!job.assistantId || job.lane !== "exclusive") {
        continue;
      }
      const intervalMs = resolveScheduleIntervalMs(job, new Date());
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        continue;
      }
      const averageDuration = getAverageDurationMs(job);
      if (!averageDuration) {
        continue;
      }
      loadByAssistant.set(job.assistantId, (loadByAssistant.get(job.assistantId) ?? 0) + averageDuration / intervalMs);
    }
    const maxCongestion = options.repository.getAssistantMaxCongestionDefault();
    return new Map([...loadByAssistant.entries()].map(([assistantId, ratio]) => [assistantId, { congested: ratio > maxCongestion, ratio }]));
  }

  function getAverageDurationMs(job: BackgroundJob) {
    const durations = options.repository.getRecentSuccessfulBackgroundJobRunDurationsMs(job.id, 5);
    if (durations.length < 5) {
      return undefined;
    }
    return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  }

  function getActiveExclusiveAssistantRun(assistantId: string, jobs: BackgroundJob[]) {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    return options.repository
      .getActiveBackgroundJobRunsByAssistant(assistantId)
      .find((run) => jobsById.get(run.jobId)?.lane !== "concurrent");
  }

  function markActiveJob(job: BackgroundJob, run: BackgroundJobRun, nowIso: string, congested: boolean, congestionRatio?: number) {
    const activeLeaseDetail =
      run.status === "running" && isFutureIso(run.controllerLeaseExpiresAt, nowIso)
        ? `controller lease active until ${run.controllerLeaseExpiresAt}`
        : undefined;
    options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: run.status === "queued" ? "queued" : run.status === "running" ? "running" : "blocked",
      schedulerDetail: activeLeaseDetail ? `Blocked by ${run.status} run ${run.id}; ${activeLeaseDetail}` : `Blocked by ${run.status} run ${run.id}`,
      blockedReason: activeLeaseDetail ? `Job already has ${run.status} run ${run.id}; ${activeLeaseDetail}` : `Job already has ${run.status} run ${run.id}`,
      schedulerActiveRunId: run.id,
      schedulerActiveRunStartedAt: run.startedAt,
      schedulerLastProgressAt: run.lastHeartbeatAt ?? run.updatedAt,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    debugLog("background.scheduler.active-block", {
      jobId: job.id,
      runId: run.id,
      status: run.status,
      assistantId: job.assistantId,
      congested
    });
  }

  function markExclusiveAssistantJobBlocked(job: BackgroundJob, run: BackgroundJobRun, nowIso: string, congested: boolean, congestionRatio?: number) {
    const activeLeaseDetail =
      run.status === "running" && isFutureIso(run.controllerLeaseExpiresAt, nowIso)
        ? `; controller lease active until ${run.controllerLeaseExpiresAt}`
        : "";
    const detail = `Exclusive assistant lane waiting for ${run.status} run ${run.id}${activeLeaseDetail}`;
    options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "blocked",
      schedulerDetail: detail,
      blockedReason: detail,
      schedulerActiveRunId: run.id,
      schedulerActiveRunStartedAt: run.startedAt,
      schedulerLastProgressAt: run.lastHeartbeatAt ?? run.updatedAt,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    debugLog("background.scheduler.exclusive-lane-block", {
      jobId: job.id,
      assistantId: job.assistantId,
      runId: run.id,
      status: run.status,
      congested
    });
  }

  function markSchedulerCapacityBlocked(
    job: BackgroundJob,
    nowIso: string,
    activeRunCount: number,
    maxActiveRuns: number,
    congested: boolean,
    congestionRatio?: number
  ) {
    const detail = `Waiting for background capacity (${activeRunCount}/${maxActiveRuns} scheduled runs active)`;
    options.repository.updateBackgroundJobSchedulerState(job.id, {
      schedulerStatus: "blocked",
      schedulerDetail: detail,
      blockedReason: detail,
      schedulerCongested: congested,
      schedulerCongestionRatio: congestionRatio,
      lastSchedulerCheckAt: nowIso
    });
    debugLog("background.scheduler.capacity-block", {
      jobId: job.id,
      assistantId: job.assistantId,
      activeRunCount,
      maxActiveRuns,
      congested
    });
  }


  function resolveCongestionDelay(job: BackgroundJob, now: Date) {
    if (job.schedule.type !== "interval" || !job.lastRunAt) {
      return undefined;
    }
    const averageDuration = getAverageDurationMs(job);
    if (!averageDuration) {
      return undefined;
    }
    const scaledIntervalMs = Math.max(job.schedule.intervalSeconds * 1000, Math.ceil(averageDuration * 1.2));
    const lastRunAt = Date.parse(job.lastRunAt);
    if (!Number.isFinite(lastRunAt)) {
      return undefined;
    }
    const nextRunAt = new Date(lastRunAt + scaledIntervalMs);
    if (nextRunAt.getTime() <= now.getTime()) {
      return undefined;
    }
    return {
      nextRunAt,
      schedule: {
        ...job.schedule,
        nextRunAt: nextRunAt.toISOString()
      }
    };
  }

  return {
    getRunsTimingOut,
    resolveAssistantCongestion,
    getActiveExclusiveAssistantRun,
    markActiveJob,
    markExclusiveAssistantJobBlocked,
    markSchedulerCapacityBlocked,
    queueDueJob,
    resolveCongestionDelay
  };
}

function readEnabledSchedulerJobs(repository: WorkspaceRepository) {
  const jobs: BackgroundJob[] = []; let afterId: string | undefined;
  do { const page = repository.listEnabledBackgroundJobsForScheduler(afterId); jobs.push(...page.items);
    afterId = page.nextAfterId; } while (afterId !== undefined); return jobs;
}

function countScheduledLaunchSlots(runs: BackgroundJobRun[]) {
  return runs.filter(isScheduledLaunchSlot).length;
}

function isScheduledLaunchSlot(run: BackgroundJobRun) {
  return run.status === "queued" || run.status === "running";
}

function resolveScheduleIntervalMs(job: BackgroundJob, now: Date) {
  if (job.schedule.type === "interval") {
    return job.schedule.intervalSeconds * 1000;
  }
  if (job.schedule.type === "cron") {
    const anchor = Date.parse(job.schedule.nextRunAt);
    if (!Number.isFinite(anchor)) {
      return Number.POSITIVE_INFINITY;
    }
    const advance = getDueScheduleAdvance(job.schedule, new Date(anchor + 1));
    const nextRunAt = advance.nextRunAt ? Date.parse(advance.nextRunAt) : Number.NaN;
    return Number.isFinite(nextRunAt) ? Math.max(1, nextRunAt - anchor) : Number.POSITIVE_INFINITY;
  }
  const runAt = Date.parse(job.schedule.runAt);
  return Number.isFinite(runAt) ? Math.max(1, Math.abs(runAt - now.getTime())) : Number.POSITIVE_INFINITY;
}

function getRunAgeMs(run: BackgroundJobRun, now: Date) {
  const startedAt = Date.parse(run.startedAt ?? run.queuedAt);
  return Number.isFinite(startedAt) ? Math.max(0, now.getTime() - startedAt) : 0;
}

function getRunLastProgressAgeMs(run: BackgroundJobRun, now: Date) {
  const timestamp = Date.parse(run.lastHeartbeatAt ?? run.updatedAt ?? run.startedAt ?? run.queuedAt);
  return Number.isFinite(timestamp) ? Math.max(0, now.getTime() - timestamp) : 0;
}

function isFutureIso(value: string | undefined, nowIso: string) {
  const timestamp = Date.parse(value ?? "");
  const now = Date.parse(nowIso);
  return Number.isFinite(timestamp) && Number.isFinite(now) && timestamp > now;
}

function formatPercent(ratio: number | undefined) {
  return `${Math.round((ratio ?? 0) * 100)}%`;
}

function resolveQueuedStatus(job: BackgroundJob, policy: BackgroundJobApprovalPolicy): BackgroundJobRunStatus {
  switch (policy) {
    case "allow-all":
      return "queued";
    case "allow-safe":
      return job.riskLevel === "safe" ? "queued" : "awaiting-approval";
    case "ask-risky":
      return job.riskLevel === "safe" ? "queued" : "awaiting-approval";
    case "always-ask":
    default:
      return "awaiting-approval";
  }
}

function resolveApprovalStatus(job: BackgroundJob, policy: BackgroundJobApprovalPolicy) {
  switch (policy) {
    case "allow-all":
      return "approved" as const;
    case "allow-safe":
      return job.riskLevel === "safe" ? ("not-needed" as const) : ("pending" as const);
    case "ask-risky":
      return job.riskLevel === "safe" ? ("not-needed" as const) : ("pending" as const);
    case "always-ask":
    default:
      return "pending" as const;
  }
}

function formatBackgroundApprovalSummary(
  job: BackgroundJob,
  triggerSource: BackgroundJobRun["triggerSource"],
  approvalPolicy: BackgroundJobApprovalPolicy
) {
  return `${job.name} is waiting before launch. Reason: ${formatRiskLevel(job.riskLevel)} ${formatTriggerSource(triggerSource)} run requires approval under ${formatApprovalPolicy(approvalPolicy)}.`;
}

function formatRiskLevel(riskLevel: BackgroundJob["riskLevel"]) {
  switch (riskLevel) {
    case "safe":
      return "safe";
    case "slightly-unsafe":
      return "slightly unsafe";
    case "unsafe":
      return "unsafe";
  }
}

function formatTriggerSource(triggerSource: BackgroundJobRun["triggerSource"]) {
  switch (triggerSource) {
    case "startup-catchup":
      return "startup catch-up";
    case "approval-release":
      return "approval release";
    default:
      return triggerSource;
  }
}

function formatApprovalPolicy(policy: BackgroundJobApprovalPolicy) {
  switch (policy) {
    case "allow-all":
      return "Allow all";
    case "allow-safe":
      return "Allow safe";
    case "ask-risky":
      return "Ask risky";
    case "always-ask":
      return "Always ask";
  }
}

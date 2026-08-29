import { READY_CONTINUATION_PAGE_LIMIT, type BackgroundJobsState, type ClientCommand,
  type NotificationInboxState, type ServerEvent } from "@hyperfocus/ai-core/protocol";

type PageCommand = Extract<ClientCommand,
  { type: "background-jobs.page.list" | "notifications.page.list" }>;

function mergeById<T extends { id: string }>(incoming: T[], existing: T[]) {
  const entries = new Map(existing.map((entry) => [entry.id, entry]));
  incoming.forEach((entry) => entries.set(entry.id, entry));
  return [...entries.values()];
}

export function mergeBackgroundJobPage(state: BackgroundJobsState,
  event: Extract<ServerEvent, { type: "background-jobs.page.listed" }>): BackgroundJobsState {
  return { ...state,
    jobs: event.payload.jobs ? mergeById(event.payload.jobs.items, state.jobs) : state.jobs,
    jobsNextCursor: event.payload.jobs ? event.payload.jobs.nextCursor : state.jobsNextCursor,
    runs: event.payload.runs ? mergeById(event.payload.runs.items, state.runs) : state.runs,
    runsNextCursor: event.payload.runs ? event.payload.runs.nextCursor : state.runsNextCursor };
}

export function mergeNotificationPage(state: NotificationInboxState,
  event: Extract<ServerEvent, { type: "notifications.page.listed" }>): NotificationInboxState {
  return { ...state, items: mergeById(event.payload.items.items, state.items),
    itemsNextCursor: event.payload.items.nextCursor };
}

export function createReadyContinuationRequests(options: {
  sendCommand: (command: ClientCommand) => boolean;
  createRequestId: () => string;
  onAssistantCursor: (cursor: string) => void;
  onTerminalError: (message: string, retry: () => void) => void;
  onUnavailable: (collection: "jobs" | "runs" | "notifications",
    items: Array<{ id: string; reason: "item-too-large"; projectId?: string; jobId?: string }>) => void;
  onAvailable: (collection: "jobs" | "runs" | "notifications", ids: string[]) => void;
  onReconciled?: (collection: "jobs" | "runs" | "notifications", retainedIds: string[]) => void;
}) {
  let jobsRequest: PageCommand | undefined;
  let notificationsRequest: PageCommand | undefined;
  let jobsRecoveryId: string | undefined; let notificationsRecoveryId: string | undefined;
  let jobsGeneration = 0; let notificationsGeneration = 0;
  let mismatchAttempts = 0;
  let restartedJobs = false; let restartedRuns = false; let restartedNotifications = false;
  let firstJobIds: string[] = []; let firstRunIds: string[] = []; let firstNotificationIds: string[] = [];
  const reconciling = { jobs: false, runs: false, notifications: false };
  const retained = { jobs: new Set<string>(), runs: new Set<string>(), notifications: new Set<string>() };
  const beginReconcile = (collection: keyof typeof reconciling, cursor?: string) => { reconciling[collection] = true;
    retained[collection].clear(); if (!cursor) { options.onReconciled?.(collection, []); reconciling[collection] = false; } };
  const finishReconcile = (collection: keyof typeof reconciling, cursor?: string) => { if (!reconciling[collection] || cursor) return;
    options.onReconciled?.(collection, [...retained[collection]]); reconciling[collection] = false; };
  const currentGeneration = (command: PageCommand) => command.type === "background-jobs.page.list" ? jobsGeneration : notificationsGeneration;
  const send = (command: PageCommand, ownerGeneration = currentGeneration(command), preserveMismatch = false) => {
    if (ownerGeneration !== currentGeneration(command)) return;
    if (command.type === "background-jobs.page.list") { jobsRequest = command; jobsRecoveryId = undefined;
      if (!preserveMismatch) mismatchAttempts = 0; } else { notificationsRequest = command; notificationsRecoveryId = undefined; }
    if (!options.sendCommand(command)) options.onTerminalError("Could not request remaining startup data.", () => {
      const current = command.type === "background-jobs.page.list" ? jobsRequest : notificationsRequest;
      if (ownerGeneration === currentGeneration(command) && current?.requestId === command.requestId)
        send(command, ownerGeneration, preserveMismatch); });
  };
  const requestJobs = (jobs?: string, runs?: string) => {
    if (!jobs && !runs) return;
    send({ type: "background-jobs.page.list", requestId: options.createRequestId(), payload: {
      jobs: jobs ? { cursor: jobs, limit: READY_CONTINUATION_PAGE_LIMIT } : undefined,
      runs: runs ? { cursor: runs, limit: READY_CONTINUATION_PAGE_LIMIT } : undefined
    } });
  };
  const requestNotifications = (cursor?: string) => {
    if (cursor) send({ type: "notifications.page.list", requestId: options.createRequestId(),
      payload: { cursor, limit: READY_CONTINUATION_PAGE_LIMIT } });
  };
  return {
    reset() { jobsGeneration += 1; notificationsGeneration += 1; jobsRequest = undefined; notificationsRequest = undefined;
      jobsRecoveryId = undefined; notificationsRecoveryId = undefined;
      restartedJobs = false; restartedRuns = false; restartedNotifications = false; mismatchAttempts = 0; },
    hydrate(cursors: { assistants?: string; jobs?: string; runs?: string; notifications?: string;
      firstJobIds?: string[]; firstRunIds?: string[]; firstNotificationIds?: string[] }) {
      this.reset(); firstJobIds = cursors.firstJobIds ?? []; firstRunIds = cursors.firstRunIds ?? [];
      firstNotificationIds = cursors.firstNotificationIds ?? [];
      options.onAvailable("jobs", firstJobIds); options.onAvailable("runs", firstRunIds);
      options.onAvailable("notifications", firstNotificationIds);
      beginReconcile("jobs", cursors.jobs); beginReconcile("runs", cursors.runs); beginReconcile("notifications", cursors.notifications);
      requestJobs(cursors.jobs, cursors.runs); requestNotifications(cursors.notifications);
      if (cursors.assistants) options.onAssistantCursor(cursors.assistants);
    },
    notificationsUpdated(state: NotificationInboxState) {
      notificationsGeneration += 1; notificationsRequest = undefined; restartedNotifications = false;
      firstNotificationIds = state.items.map(({ id }) => id); options.onAvailable("notifications", firstNotificationIds);
      beginReconcile("notifications", state.itemsNextCursor);
      requestNotifications(state.itemsNextCursor);
    },
    backgroundJobsUpdated(state: BackgroundJobsState) {
      jobsGeneration += 1; jobsRequest = undefined; restartedJobs = false; restartedRuns = false;
      firstJobIds = state.jobs.map(({ id }) => id); firstRunIds = state.runs.map(({ id }) => id);
      options.onAvailable("jobs", firstJobIds); options.onAvailable("runs", firstRunIds);
      beginReconcile("jobs", state.jobsNextCursor); beginReconcile("runs", state.runsNextCursor);
      requestJobs(state.jobsNextCursor, state.runsNextCursor);
    },
    retryUnavailable(collections: ReadonlySet<"jobs" | "runs" | "notifications">) {
      if (collections.has("notifications")) { restartedNotifications = true;
        beginReconcile("notifications", "pending");
        send({ type: "notifications.page.list", requestId: options.createRequestId(),
          payload: { limit: READY_CONTINUATION_PAGE_LIMIT } }); }
      restartedJobs ||= collections.has("jobs"); restartedRuns ||= collections.has("runs");
      if (collections.has("jobs")) beginReconcile("jobs", "pending"); if (collections.has("runs")) beginReconcile("runs", "pending");
      if (!restartedJobs && !restartedRuns) return;
      send({ type: "background-jobs.page.list", requestId: options.createRequestId(), payload: {
        jobs: collections.has("jobs") ? { limit: READY_CONTINUATION_PAGE_LIMIT } : undefined,
        runs: collections.has("runs") ? { limit: READY_CONTINUATION_PAGE_LIMIT } : undefined } });
    },
    accepts(event: ServerEvent) {
      if (event.type === "background-jobs.page.listed") {
        if (jobsRequest?.type !== "background-jobs.page.list" || jobsRequest.requestId !== event.requestId) return false;
        const requested = [jobsRequest.payload.jobs && "jobs", jobsRequest.payload.runs && "runs"].filter(Boolean).sort().join(",");
        if ([...event.payload.collections].sort().join(",") === requested) return true;
        const command = jobsRequest; jobsRequest = undefined;
        if (mismatchAttempts < 3) { mismatchAttempts += 1; send({ ...command, requestId: options.createRequestId() }, jobsGeneration, true); }
        else { const ownerGeneration = jobsGeneration; jobsRecoveryId = command.requestId;
          options.onTerminalError("Background page response did not match the requested collections.",
          () => { if (ownerGeneration !== jobsGeneration || jobsRecoveryId !== command.requestId) return; mismatchAttempts = 0;
            jobsRecoveryId = undefined; send({ ...command, requestId: options.createRequestId() }); }); }
        return false;
      }
      if (event.type === "notifications.page.listed") return notificationsRequest?.requestId === event.requestId;
      return true;
    },
    prepareBackgroundJobs(state: BackgroundJobsState,
      event: Extract<ServerEvent, { type: "background-jobs.page.listed" }>) {
      if (jobsRequest?.requestId !== event.requestId) return state;
      return { ...state,
        jobs: restartedJobs && event.payload.jobs ? state.jobs.filter(({ id }) => !firstJobIds.includes(id)) : state.jobs,
        runs: restartedRuns && event.payload.runs ? state.runs.filter(({ id }) => !firstRunIds.includes(id)) : state.runs };
    },
    prepareNotifications(state: NotificationInboxState,
      event: Extract<ServerEvent, { type: "notifications.page.listed" }>) {
      return notificationsRequest?.requestId === event.requestId && restartedNotifications
        ? { ...state, items: state.items.filter(({ id }) => !firstNotificationIds.includes(id)) } : state;
    },
    handle(event: ServerEvent) {
      if (event.type === "background-jobs.page.listed" && jobsRequest?.requestId === event.requestId) {
        jobsRequest = undefined;
        mismatchAttempts = 0;
        const unavailableJobs = event.payload.jobs?.unavailableItems ?? [];
        const unavailableRuns = event.payload.runs?.unavailableItems ?? [];
        if (unavailableJobs.length) options.onUnavailable("jobs", unavailableJobs);
        if (unavailableRuns.length) options.onUnavailable("runs", unavailableRuns);
        unavailableJobs.forEach(({ id }) => retained.jobs.add(id)); unavailableRuns.forEach(({ id }) => retained.runs.add(id));
        if (event.payload.jobs) options.onAvailable("jobs", event.payload.jobs.items.map(({ id }) => id));
        if (event.payload.runs) options.onAvailable("runs", event.payload.runs.items.map(({ id }) => id));
        finishReconcile("jobs", event.payload.jobs?.nextCursor); finishReconcile("runs", event.payload.runs?.nextCursor);
        restartedJobs = false; restartedRuns = false;
        requestJobs(event.payload.jobs?.nextCursor, event.payload.runs?.nextCursor);
      } else if (event.type === "notifications.page.listed" && notificationsRequest?.requestId === event.requestId) {
        notificationsRequest = undefined;
        const unavailable = event.payload.items.unavailableItems ?? [];
        if (unavailable.length) options.onUnavailable("notifications", unavailable);
        unavailable.forEach(({ id }) => retained.notifications.add(id));
        options.onAvailable("notifications", event.payload.items.items.map(({ id }) => id));
        finishReconcile("notifications", event.payload.items.nextCursor);
        restartedNotifications = false; requestNotifications(event.payload.items.nextCursor);
      } else if (event.type === "command.rejected" && event.requestId) {
        const failed = jobsRequest?.requestId === event.requestId ? jobsRequest
          : notificationsRequest?.requestId === event.requestId ? notificationsRequest : undefined;
        if (!failed) return;
        if (failed.type === "background-jobs.page.list") jobsRequest = undefined; else notificationsRequest = undefined;
        const ownerGeneration = failed.type === "background-jobs.page.list" ? jobsGeneration : notificationsGeneration;
        if (failed.type === "background-jobs.page.list") jobsRecoveryId = failed.requestId;
        else notificationsRecoveryId = failed.requestId;
        if (event.payload.code === "invalid-cursor") {
          if (failed.type === "background-jobs.page.list") { restartedJobs ||= !!failed.payload.jobs; restartedRuns ||= !!failed.payload.runs; }
          else restartedNotifications = true;
        }
        const retry = () => { const recoveryId = failed.type === "background-jobs.page.list" ? jobsRecoveryId : notificationsRecoveryId;
          if (ownerGeneration !== currentGeneration(failed) || recoveryId !== failed.requestId) return; if (event.payload.code === "invalid-cursor") {
            if (failed.type === "background-jobs.page.list") { if (failed.payload.jobs) beginReconcile("jobs", "pending");
              if (failed.payload.runs) beginReconcile("runs", "pending"); } else beginReconcile("notifications", "pending");
          }
          if (failed.type === "background-jobs.page.list") jobsRecoveryId = undefined; else notificationsRecoveryId = undefined;
          return failed.type === "background-jobs.page.list"
            ? send({ ...failed, requestId: options.createRequestId(), payload: event.payload.code === "invalid-cursor"
              ? { jobs: failed.payload.jobs ? { limit: READY_CONTINUATION_PAGE_LIMIT } : undefined,
                runs: failed.payload.runs ? { limit: READY_CONTINUATION_PAGE_LIMIT } : undefined } : failed.payload }, ownerGeneration)
            : send({ ...failed, requestId: options.createRequestId(),
              payload: event.payload.code === "invalid-cursor" ? { limit: READY_CONTINUATION_PAGE_LIMIT } : failed.payload }, ownerGeneration); };
        options.onTerminalError(event.payload.detail ?? event.payload.message, retry);
      }
    }
  };
}

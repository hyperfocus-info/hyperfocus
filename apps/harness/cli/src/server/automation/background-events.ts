import { emitControlEvent } from "../transport/events";
import type { ControlEventConnections } from "../transport/events";
import type { WorkspaceRepository } from "../../workspace-repository";
import { BACKGROUND_JOB_DELETION_CHUNK_LIMIT, SERVER_EVENT_EMIT_MAX_BYTES } from "@hyperfocus/ai-core/protocol";
import type { BackgroundJobRun, BackgroundJobsState, ServerEvent } from "@hyperfocus/ai-core/protocol";

type DeletionTarget = Extract<ServerEvent, { type: "background-jobs.deleted" }>["payload"]["targets"][number];

export function emitBackgroundJobsUpdatedToAll(
  connections: ControlEventConnections,
  backgroundJobs: BackgroundJobsState
) {
  const requestId = `bg:auto:${crypto.randomUUID()}`; let bounded = backgroundJobs;
  const size = () => new TextEncoder().encode(JSON.stringify({ type: "background-jobs.updated", requestId,
    payload: { backgroundJobs: bounded } })).byteLength;
  if (size() > SERVER_EVENT_EMIT_MAX_BYTES) bounded = { ...bounded, jobs: [], jobsNextCursor: "__start__",
    runs: [], runsNextCursor: "__start__" };
  emitControlEvent(connections, { type: "background-jobs.updated", requestId, payload: { backgroundJobs: bounded } });
}

export function emitBackgroundJobsDeletedToAll(
  connections: ControlEventConnections,
  requestId: string,
  targets: DeletionTarget[],
  deletedJobIds: string[]
) {
  if (targets.length === 0) return;
  const chunks = deletedJobIds.length === 0 ? [[]] : Array.from(
    { length: Math.ceil(deletedJobIds.length / BACKGROUND_JOB_DELETION_CHUNK_LIMIT) },
    (_, index) => deletedJobIds.slice(index * BACKGROUND_JOB_DELETION_CHUNK_LIMIT,
      (index + 1) * BACKGROUND_JOB_DELETION_CHUNK_LIMIT)
  );
  for (const chunk of chunks) emitControlEvent(connections,
    { type: "background-jobs.deleted", requestId, payload: { targets, deletedJobIds: chunk } });
}

export function emitBackgroundJobRunUpdatedToAll(
  connections: ControlEventConnections,
  run: BackgroundJobRun
) {
  emitControlEvent(connections, { type: "background-job-run.updated", requestId: `bg:auto:${crypto.randomUUID()}`,
    payload: { run } });
}

export function emitNotificationsUpdatedToAll(
  connections: ControlEventConnections,
  requestId: string,
  notifications: ReturnType<WorkspaceRepository["loadNotificationInboxState"]>
) {
  let bounded = notifications; const size = () => new TextEncoder().encode(JSON.stringify({ type: "notifications.updated",
    requestId, payload: { notifications: bounded } })).byteLength;
  if (size() > SERVER_EVENT_EMIT_MAX_BYTES) bounded = { ...bounded, items: [], itemsNextCursor: "__start__" };
  emitControlEvent(connections, { type: "notifications.updated", requestId, payload: { notifications: bounded } });
}

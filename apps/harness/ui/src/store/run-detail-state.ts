import { agentRunStateSchema, createRequestId, getUtf8ByteLength, RUN_DETAIL_MAX_BYTES, type AgentRunState,
  type ClientCommand, type ServerEvent } from "@hyperfocus/ai-core/protocol";
import { createStore } from "solid-js/store";

type Loaded = Extract<ServerEvent, { type: "run.detail.loaded" }>;
type Scope = { projectId: string; threadId: string; runId: string };
type ProjectionScope = Omit<Scope, "runId"> & { run?: AgentRunState };
type Owner = Scope & { requestId: string; projectionKey: string; chunks: string[]; attempt: number };
const RETRY_LIMIT = 2;
const projectionKey = (run: AgentRunState) => JSON.stringify(run);

export type RunDetailRecovery = Scope & { status: "retryable" | "loading"; retry: () => void };
const [recoveries, setRecoveries] = createStore<RunDetailRecovery[]>([]);
export const runDetailRecoveries = recoveries;
export function setRunDetailRecovery(recovery: RunDetailRecovery) {
  setRecoveries((items) => [...items.filter(({ runId }) => runId !== recovery.runId), recovery]);
}
export function clearRunDetailRecovery(runId: string) {
  setRecoveries((items) => items.filter((recovery) => recovery.runId !== runId));
}
export function beginRunDetailRetry(runId: string, admit: () => boolean = () => true) {
  const index = recoveries.findIndex((recovery) => recovery.runId === runId && recovery.status === "retryable");
  if (index < 0) return false;
  const recovery = recoveries[index]!;
  if (!admit()) return false;
  const currentIndex = recoveries.findIndex((candidate) => candidate.runId === runId &&
    candidate.status === "retryable" && candidate.retry === recovery.retry);
  if (currentIndex >= 0) setRecoveries(currentIndex, "status", "loading");
  return true;
}
export function retainRunDetailRecoveries(runIds: Set<string>) {
  setRecoveries((items) => items.filter(({ runId }) => runIds.has(runId)));
}

export function createRunDetailRequests(options: {
  send(command: ClientCommand): boolean;
  getProjection(scope: Scope): AgentRunState | undefined;
  onLoaded(projectId: string, threadId: string, run: AgentRunState): void;
  onUnavailable(projectId: string, threadId: string, runId: string, retry: () => boolean): void;
  maxBytes?: number;
}) {
  const owners = new Map<string, Owner>(), demanded = new Map<string, Omit<Scope, "runId">>();
  const sendPage = (owner: Omit<Owner, "requestId">, cursor?: string) => {
    const requestId = createRequestId(), next = { ...owner, requestId }; owners.set(owner.runId, next);
    if (!options.send({ type: "run.detail.get", requestId, payload: { projectId: owner.projectId,
      threadId: owner.threadId, runId: owner.runId, cursor, limit: 128 } })) fail(next);
  };
  const retry = (owner: Owner) => sendPage({ ...owner, chunks: [], attempt: owner.attempt + 1 });
  const fail = (owner: Owner) => {
    if (owners.get(owner.runId)?.requestId !== owner.requestId) return;
    if (owner.attempt < RETRY_LIMIT) { retry(owner); return; }
    owners.delete(owner.runId);
    options.onUnavailable(owner.projectId, owner.threadId, owner.runId, () => {
      const demand = demanded.get(owner.runId);
      if (demand?.projectId !== owner.projectId || demand.threadId !== owner.threadId) return false;
      const run = options.getProjection(owner);
      if (!run) return false;
      sendPage({ ...owner, projectionKey: projectionKey(run), chunks: [], attempt: 0 }); return true;
    });
  };
  return {
    reset() { owners.clear(); demanded.clear(); },
    reject(requestId: string) {
      const owner = [...owners.values()].find((entry) => entry.requestId === requestId);
      if (!owner) return false;
      fail(owner); return true;
    },
    request(projectId: string, threadId: string, run: AgentRunState | undefined) {
      if (!run || run.detailState !== "summary") return;
      demanded.set(run.id, { projectId, threadId });
      const key = projectionKey(run), current = owners.get(run.id);
      if (current?.projectionKey === key && current.projectId === projectId && current.threadId === threadId) return;
      sendPage({ projectId, threadId, runId: run.id, projectionKey: key, chunks: [], attempt: 0 });
    },
    reconcile(scopes: ProjectionScope[]) {
      const runIds = new Set<string>(), nextDemanded = new Map<string, Omit<Scope, "runId">>();
      for (const { projectId, threadId, run } of scopes) {
        if (!run) continue;
        runIds.add(run.id); nextDemanded.set(run.id, { projectId, threadId });
        if (run.detailState === "summary") {
          clearRunDetailRecovery(run.id); this.request(projectId, threadId, run);
        } else if (run.detailState === "complete") clearRunDetailRecovery(run.id);
      }
      for (const [runId, owner] of owners) {
        const demand = nextDemanded.get(runId);
        if (!demand || demand.projectId !== owner.projectId || demand.threadId !== owner.threadId) owners.delete(runId);
      }
      demanded.clear(); for (const [runId, demand] of nextDemanded) demanded.set(runId, demand);
      retainRunDetailRecoveries(runIds);
    },
    accepts(event: Loaded) {
      const owner = owners.get(event.payload.runId);
      return owner?.requestId === event.requestId && owner.projectId === event.payload.projectId &&
        owner.threadId === event.payload.threadId;
    },
    apply(event: Loaded) {
      const owner = owners.get(event.payload.runId);
      if (!owner || !this.accepts(event)) return;
      const chunks = [...owner.chunks, ...event.payload.chunks.items];
      if (chunks.reduce((total, chunk) => total + getUtf8ByteLength(chunk), 0) >
        (options.maxBytes ?? RUN_DETAIL_MAX_BYTES)) { fail(owner); return; }
      if (event.payload.chunks.nextCursor) { sendPage({ ...owner, chunks }, event.payload.chunks.nextCursor); return; }
      let run: AgentRunState;
      try { run = agentRunStateSchema.parse(JSON.parse(chunks.join(""))); } catch { fail(owner); return; }
      if (run.id !== owner.runId || run.threadId !== owner.threadId || run.detailState !== "complete") { fail(owner); return; }
      const current = options.getProjection(owner);
      if (!current || projectionKey(current) !== owner.projectionKey) {
        owners.delete(owner.runId);
        if (current?.detailState === "summary") this.request(owner.projectId, owner.threadId, current);
        return;
      }
      if (current.threadRunSequence !== undefined && run.threadRunSequence !== current.threadRunSequence) { fail(owner); return; }
      owners.delete(owner.runId); options.onLoaded(owner.projectId, owner.threadId, run);
    }
  };
}

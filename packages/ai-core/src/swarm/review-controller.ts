import type { SwarmClient } from "./client";
import type { CreateSwarmRequest, SwarmCapabilities, SwarmContext, SwarmRun } from "./contracts";

const terminal = new Set(["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT", "BLOCKED"]);
const awaitingReview = new Set(["AWAITING_APPROVAL", "READY"]);

/** Ephemeral host view state. The coordinator remains authoritative across refresh/restart. */
export function createSwarmReviewController(options: {
  client: SwarmClient;
  projectId: string;
  pollMs?: number;
  stream?: boolean;
  selectLatest?: boolean;
  issueAccessOnStart?: boolean;
  onError?: (message: string) => void;
}) {
  let state: {
    context?: SwarmContext;
    capabilities?: SwarmCapabilities;
    runs: SwarmRun[];
    selectedId: string;
    loading: boolean;
    pending: boolean;
    error: string;
    updates: "idle" | "connecting" | "live" | "paused";
    cloudAccess?: {url:string;expiresAt:number};
  } = { runs: [], selectedId: "", loading: false, pending: false, error: "", updates: "idle" };
  const listeners = new Set<() => void>();
  let disposed = false;
  let epoch = 0;
  let selectionTouched = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stream: AbortController | undefined;
  let reconnectAttempts=0;
  const notify = () => { if (!disposed) for (const listener of listeners) listener(); };
  const update = (patch: Partial<typeof state>) => { if (!disposed) { state = { ...state, ...patch }; notify(); } };
  const selected = () => state.runs.find(run => run.id === state.selectedId);
  const failure = (cause: unknown) => {
    const error = cause instanceof Error ? cause.message : String(cause);
    update({ error });
    if (!disposed) options.onError?.(error);
  };
  const saveRun = (run: SwarmRun) => update({ runs: [run, ...state.runs.filter(value => value.id !== run.id)], selectedId: run.id });
  const stopUpdates = () => { clearTimeout(timer); stream?.abort(); stream = undefined; };
  const schedule = () => {
    stopUpdates();
    const run = selected();
    if (disposed || !run || state.capabilities?.archive || (terminal.has(run.status) || !options.stream && awaitingReview.has(run.status)) && !run.tasks.some(task => task.status === "RUNNING") || state.pending) { update({updates:"idle"}); return; }
    if (options.stream) {
      const active = new AbortController(); stream = active;
      update({updates:"connecting"});
      void options.client.watch(run.id, incoming => {
        if (disposed || active.signal.aborted || incoming.id !== state.selectedId) return;
        if (incoming.updatedAt < (selected()?.updatedAt ?? 0)) return;
        saveRun(incoming);
        reconnectAttempts=0;update({error:""});
        if(terminal.has(incoming.status) && !incoming.tasks.some(task=>task.status==="RUNNING")){
          stopUpdates();update({updates:"idle"});
        }else update({updates:"live"});
      }, active.signal).then(() => {
        if (!active.signal.aborted && !disposed) reconnect();
      }).catch(cause => { if (!active.signal.aborted && !disposed) {
        const detail=cause instanceof Error?cause.message:String(cause);
        if(/\(40[134]\)|expired|revoked/i.test(detail)){update({updates:"paused"});failure(cause);}
        else{update({error:detail});reconnect();}
      } });
      return;
    }
    timer = setTimeout(() => { void poll(); }, Math.max(500, options.pollMs ?? 2_000));
  };
  function reconnect(){
    if(disposed||terminal.has(selected()?.status??"")){update({updates:"idle"});return;}
    update({updates:"connecting"});
    const generation=epoch;
    timer=setTimeout(()=>{if(!disposed&&generation===epoch)schedule();},Math.min(30000,(options.pollMs??1000)*2**Math.min(reconnectAttempts++,5)));
  }
  const poll = async () => {
    const id = state.selectedId;
    const generation = epoch;
    try {
      const run = await options.client.get(id);
      if (disposed || generation !== epoch || state.selectedId !== id || state.pending) return;
      saveRun(run);
    } catch (cause) {
      if (!disposed && generation === epoch) failure(cause);
      // A transport failure requires an explicit refresh; avoid infinite retries.
      return;
    }
    schedule();
  };

  async function refresh() {
    if (disposed || state.loading || state.pending) return;
    const generation = ++epoch;
    stopUpdates();
    update({ loading: true, error: "" });
    const [context, capabilities] = await Promise.allSettled([options.client.context(options.projectId), options.client.capabilities()]);
    if (disposed || generation !== epoch) return;
    const [runs] = capabilities.status === 'fulfilled' && !capabilities.value.available && !capabilities.value.archive
      ? [{status:'fulfilled' as const,value:[]}]
      : await Promise.allSettled([options.client.list(options.projectId)]);
    const results=[context,capabilities,runs];
    if (disposed || generation !== epoch) return;
    update({
      loading: false,
      ...(context.status === "fulfilled" ? { context: context.value } : {}),
      ...(capabilities.status === "fulfilled" ? { capabilities: capabilities.value } : {}),
      ...(runs.status === "fulfilled" ? { runs: runs.value, ...(options.selectLatest && !selectionTouched && !state.selectedId ? {selectedId:runs.value[0]?.id ?? ""} : {}) } : {}),
    });
    const providerUnavailable = context.status === "fulfilled" && !context.value.provider.available;
    const failed = results.find((result, index) => result.status === "rejected"
      && !(index > 0 && providerUnavailable)
      && !(index === 2 && capabilities.status === "fulfilled" && !capabilities.value.available));
    if (failed?.status === "rejected") failure(failed.reason);
    else schedule();
  }

  async function mutate(operation: () => Promise<SwarmRun>) {
    if (disposed || state.pending) return;
    if (state.capabilities?.archive) { failure(new Error("Archived evidence is read-only.")); return; }
    ++epoch;
    stopUpdates();
    update({ pending: true, loading: false, error: "" });
    try { const run = await operation(); if (!disposed) saveRun(run); }
    catch (cause) { failure(cause); }
    finally { update({ pending: false }); schedule(); }
  }

  return {
    snapshot: () => state,
    selected,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh,
    select(id: string) {
      selectionTouched = true;
      ++epoch;
      stopUpdates();
      update({ selectedId: id, loading: false, error: "",cloudAccess:undefined });
      schedule();
    },
    create(input: CreateSwarmRequest) { return mutate(() => options.client.create(input)); },
    action(action: "start" | "cancel" | "reject" | "approve", candidateId?: string) {
      const runId = state.selectedId;
      if (!runId) return Promise.resolve();
      return mutate(async()=>{
        if(action==="start"&&options.issueAccessOnStart!==false&&state.capabilities?.executionAuthority==="cloud"){
          const access=await options.client.issueBrowserAccess({runId,access:"control"});
          if(!disposed)update({cloudAccess:access});
        }
        return options.client.action(runId, action, candidateId);
      });
    },
    steer(text: string, taskId?: string) {
      const runId = state.selectedId;
      return runId ? mutate(() => options.client.steer(runId, {requestId:crypto.randomUUID(),text,taskId})) : Promise.resolve();
    },
    followUp(goal: string, doneCriteria?: string[]) {
      const runId = state.selectedId;
      return runId ? mutate(() => options.client.followUp(runId, {requestId:crypto.randomUUID(),goal,doneCriteria})) : Promise.resolve();
    },
    dispose() { disposed = true; ++epoch; stopUpdates(); listeners.clear(); },
  };
}

export type SwarmReviewController = ReturnType<typeof createSwarmReviewController>;

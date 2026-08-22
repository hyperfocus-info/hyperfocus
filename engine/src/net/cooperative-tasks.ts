export type CooperativePeer = {
  id: string;
  capacity?: number;
};

export type CooperativeTaskAssignment<TPayload> = {
  taskId: string;
  peerId: string;
  attempt: number;
  leaseToken: string;
  leaseExpiresAt: number;
  payload: TPayload;
};

export type CooperativeTaskState = "queued" | "leased" | "verifying" | "completed" | "failed";

export type CooperativeTaskCoordinatorOptions<TPayload> = {
  leaseMs?: number;
  maxAttempts?: number;
  maxTasks?: number;
  maxPeers?: number;
  clonePayload?: (payload: TPayload) => TPayload;
};

type TaskRecord<TPayload> = {
  id: string;
  payload: TPayload;
  state: CooperativeTaskState;
  attempt: number;
  peerId?: string;
  leaseToken?: string;
  leaseExpiresAt?: number;
  previousPeerId?: string;
  untrustedResult?: unknown;
};

function identifier(value: string, label: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 1_024) throw new Error(`${label} must contain 1-1024 characters`);
  return value;
}

function nowValue(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("cooperative task time must be non-negative and finite");
  return value;
}

function cloneDefault<T>(value: T): T {
  if (typeof structuredClone !== "function") throw new Error("cooperative tasks need clonePayload when structuredClone is unavailable");
  return structuredClone(value);
}

/**
 * Lease-based deterministic work distribution. Submitted results remain in a
 * verifying state until trusted application code explicitly accepts them.
 */
export function createCooperativeTaskCoordinator<TPayload>(options: CooperativeTaskCoordinatorOptions<TPayload> = {}) {
  const leaseMs = options.leaseMs ?? 2_000;
  const maxAttempts = options.maxAttempts ?? 3;
  const maxTasks = options.maxTasks ?? 10_000;
  const maxPeers = options.maxPeers ?? 256;
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new RangeError("leaseMs must be positive and finite");
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new RangeError("maxAttempts must be a positive safe integer");
  if (!Number.isSafeInteger(maxTasks) || maxTasks < 1) throw new RangeError("maxTasks must be a positive safe integer");
  if (!Number.isSafeInteger(maxPeers) || maxPeers < 1) throw new RangeError("maxPeers must be a positive safe integer");
  const clonePayload = options.clonePayload ?? cloneDefault<TPayload>;
  const tasks = new Map<string, TaskRecord<TPayload>>();
  let peers: Array<{ id: string; capacity: number }> = [];
  const inFlight = new Map<string, number>();

  function release(record: TaskRecord<TPayload>) {
    if (record.peerId) inFlight.set(record.peerId, Math.max(0, (inFlight.get(record.peerId) ?? 0) - 1));
    record.previousPeerId = record.peerId;
    record.peerId = undefined;
    record.leaseToken = undefined;
    record.leaseExpiresAt = undefined;
  }

  function requeue(record: TaskRecord<TPayload>) {
    release(record);
    record.untrustedResult = undefined;
    record.state = record.attempt >= maxAttempts ? "failed" : "queued";
  }

  function expire(now: number) {
    let count = 0;
    for (const record of tasks.values()) {
      if (record.state === "leased" && record.leaseExpiresAt !== undefined && record.leaseExpiresAt <= now) {
        requeue(record);
        count += 1;
      }
    }
    return count;
  }

  function selectedPeer(record: TaskRecord<TPayload>) {
    const available = peers.filter((peer) => (inFlight.get(peer.id) ?? 0) < peer.capacity);
    if (available.length === 0) return undefined;
    const alternatives = available.filter((peer) => peer.id !== record.previousPeerId);
    const candidates = alternatives.length > 0 ? alternatives : available;
    candidates.sort((left, right) => {
      const leftLoad = (inFlight.get(left.id) ?? 0) / left.capacity;
      const rightLoad = (inFlight.get(right.id) ?? 0) / right.capacity;
      return leftLoad - rightLoad || left.id.localeCompare(right.id);
    });
    return candidates[0];
  }

  return {
    updatePeers(nextPeers: readonly CooperativePeer[]) {
      if (!Array.isArray(nextPeers)) throw new TypeError("cooperative peers must be an array");
      if (nextPeers.length > maxPeers) throw new RangeError(`cooperative peer count exceeds ${maxPeers}`);
      const seen = new Set<string>();
      const normalized = nextPeers.map((peer) => {
        const id = identifier(peer.id, "cooperative peer id");
        if (seen.has(id)) throw new Error(`duplicate cooperative peer id: ${id}`);
        seen.add(id);
        const capacity = peer.capacity ?? 1;
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("cooperative peer capacity must be a positive safe integer");
        return { id, capacity };
      }).sort((left, right) => left.id.localeCompare(right.id));
      peers = normalized;
      for (const record of tasks.values()) {
        if ((record.state === "leased" || record.state === "verifying") && record.peerId && !seen.has(record.peerId)) requeue(record);
      }
    },
    enqueue(taskId: string, payload: TPayload) {
      const id = identifier(taskId, "cooperative task id");
      if (tasks.has(id)) throw new Error(`duplicate cooperative task id: ${id}`);
      if (tasks.size >= maxTasks) throw new RangeError(`cooperative task count exceeds ${maxTasks}`);
      tasks.set(id, { id, payload: clonePayload(payload), state: "queued", attempt: 0 });
    },
    assign(now: number, out: CooperativeTaskAssignment<TPayload>[] = []) {
      nowValue(now);
      expire(now);
      for (const record of tasks.values()) {
        if (record.state !== "queued") continue;
        const peer = selectedPeer(record);
        if (!peer) break;
        record.attempt += 1;
        record.peerId = peer.id;
        record.leaseExpiresAt = now + leaseMs;
        // This deterministic token rejects stale completions; it is not an
        // authentication credential and transports must still bind peer ids.
        record.leaseToken = `${record.id}:${record.attempt}:${peer.id}`;
        record.state = "leased";
        inFlight.set(peer.id, (inFlight.get(peer.id) ?? 0) + 1);
        out.push({
          taskId: record.id,
          peerId: peer.id,
          attempt: record.attempt,
          leaseToken: record.leaseToken,
          leaseExpiresAt: record.leaseExpiresAt,
          payload: clonePayload(record.payload)
        });
      }
      return out;
    },
    expire(now: number) {
      nowValue(now);
      return expire(now);
    },
    submitResult(taskId: string, peerId: string, leaseToken: string, result: unknown, now: number) {
      nowValue(now);
      const record = tasks.get(identifier(taskId, "cooperative task id"));
      if (!record || record.state !== "leased") return false;
      if (record.peerId !== peerId || record.leaseToken !== leaseToken || record.leaseExpiresAt === undefined || now >= record.leaseExpiresAt) return false;
      record.state = "verifying";
      record.untrustedResult = result;
      return true;
    },
    pendingResult(taskId: string) {
      const record = tasks.get(taskId);
      if (!record || record.state !== "verifying") return undefined;
      return { taskId: record.id, peerId: record.peerId!, attempt: record.attempt, result: record.untrustedResult };
    },
    acceptResult(taskId: string) {
      const record = tasks.get(taskId);
      if (!record || record.state !== "verifying") return false;
      release(record);
      record.untrustedResult = undefined;
      record.state = "completed";
      return true;
    },
    rejectResult(taskId: string) {
      const record = tasks.get(taskId);
      if (!record || record.state !== "verifying") return false;
      requeue(record);
      return true;
    },
    state(taskId: string) {
      const record = tasks.get(taskId);
      if (!record) return undefined;
      return { state: record.state, attempt: record.attempt, peerId: record.peerId, leaseExpiresAt: record.leaseExpiresAt };
    },
    remove(taskId: string) {
      const record = tasks.get(taskId);
      if (!record) return false;
      if (record.state === "leased" || record.state === "verifying") release(record);
      return tasks.delete(taskId);
    }
  };
}

import type { BackupEncryptionKey, SessionReplayConsumeResult, SessionReplayStore, SessionSigningKey } from "./operations.ts";
import type { PersistenceAdapter } from "./types.ts";

export type DeploymentFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DeploymentHttpOptions = {
  endpoint: string;
  bearerToken: string;
  fetch?: DeploymentFetch;
  timeoutMs?: number;
};

export type DeploymentKeyRing = {
  activeSessionKeyId: string;
  sessionKeys: SessionSigningKey[];
  activeBackupKeyId: string;
  backupKeys: BackupEncryptionKey[];
  version: string;
};

export type RegionalCapacitySample = {
  region: string;
  currentInstances: number;
  readyInstances: number;
  utilization: number;
  queueDepth: number;
};

export type RegionalScalingPolicy = {
  minInstances: number;
  maxInstances: number;
  targetUtilization?: number;
  scaleOutStep?: number;
  scaleInStep?: number;
  queuePerInstance?: number;
  cooldownMs?: number;
};

export type RegionalScaleDecision = RegionalCapacitySample & {
  desiredInstances: number;
  reason: "queue" | "utilization-high" | "utilization-low" | "minimum" | "stable" | "cooldown";
  at: number;
};

export type OnCallOperator = { id: string; displayName: string; pagingTarget: string };
export type OnCallRoster = {
  primary: OnCallOperator;
  secondary: OnCallOperator;
  startsAt: number;
  endsAt: number;
  escalationPolicyUrl: string;
  runbookUrl: string;
};

export type RegionCoordinatorBackend = {
  heartbeat(input: { nodeId: string; region: string; endpoint: string; capacity: number; load: number; ttlMs: number }): Promise<void>;
  acquireLease(input: { name: string; nodeId: string; region: string; ttlMs: number }): Promise<{ acquired: boolean; holder: string; expiresAt: number }>;
};

export type DeploymentControlPlaneOptions = {
  bearerToken: string;
  replayStore: SessionReplayStore;
  persistence: PersistenceAdapter;
  keys: { load(): Promise<DeploymentKeyRing> };
  regions: RegionCoordinatorBackend;
  setDesiredCapacity(decision: RegionalScaleDecision): Promise<void>;
  maxRequestBytes?: number;
};

/** Deployable fetch handler for the authenticated control-plane clients in this module. */
export function createDeploymentControlPlaneHandler(options: DeploymentControlPlaneOptions): (request: Request) => Promise<Response> {
  const token = text(options.bearerToken, "bearerToken");
  const maximum = integer(options.maxRequestBytes ?? 64 * 1024, 1_024, 1024 * 1024, "maxRequestBytes");
  return async (request) => {
    try {
      if (request.method !== "POST") return response({ error: "method-not-allowed" }, 405);
      if (!constantTimeTextEqual(request.headers.get("authorization") ?? "", `Bearer ${token}`)) return response({ error: "unauthorized" }, 401);
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (Number.isFinite(declared) && declared > maximum) return response({ error: "request-too-large" }, 413);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > maximum) return response({ error: "request-too-large" }, 413);
      const body = record(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
      const path = new URL(request.url).pathname;
      if (path === "/v1/replay/consume") {
        const result = await options.replayStore.consume(text(body.nonce, "nonce"), integer(body.expiresAt, 0, Number.MAX_SAFE_INTEGER, "expiresAt"), integer(body.now, 0, Number.MAX_SAFE_INTEGER, "now"));
        return response({ result });
      }
      if (path === "/v1/persistence/player/load") return response({ value: await options.persistence.loadPlayer(text(body.id, "id")) });
      if (path === "/v1/persistence/player/save") { await options.persistence.savePlayer(text(body.id, "id"), body.value); return response({ ok: true }); }
      if (path === "/v1/persistence/room/load") return response({ value: await options.persistence.loadRoom(text(body.id, "id")) });
      if (path === "/v1/persistence/room/save") { await options.persistence.saveRoom(text(body.id, "id"), body.value); return response({ ok: true }); }
      if (path === "/v1/persistence/event/append") {
        if (!options.persistence.appendEvent) return response({ error: "event-persistence-unavailable" }, 503);
        await options.persistence.appendEvent(body.value); return response({ ok: true });
      }
      if (path === "/v1/keys/load") {
        const keys = await options.keys.load();
        return response({ ...keys, sessionKeys: encodeKeyArray(keys.sessionKeys), backupKeys: encodeKeyArray(keys.backupKeys) });
      }
      if (path === "/v1/regions/heartbeat") { await options.regions.heartbeat(heartbeatInput(body)); return response({ ok: true }); }
      if (path === "/v1/regions/lease") return response(await options.regions.acquireLease(leaseInput(body)));
      if (path === "/v1/capacity/desired") { await options.setDesiredCapacity(scaleDecision(body)); return response({ ok: true }); }
      return response({ error: "not-found" }, 404);
    } catch (cause) {
      return response({ error: "invalid-request", message: cause instanceof Error ? cause.message : String(cause) }, 400);
    }
  };
}

/** Atomic replay consumption through a shared authenticated control-plane endpoint. */
export function createHttpSessionReplayStore(options: DeploymentHttpOptions): SessionReplayStore {
  const client = httpClient(options);
  return {
    async consume(nonce, expiresAt, now) {
      const payload = await client("/v1/replay/consume", { nonce, expiresAt, now });
      const result = record(payload).result;
      if (result !== "accepted" && result !== "replayed" && result !== "saturated") throw new Error("Replay control plane returned an invalid result.");
      return result as SessionReplayConsumeResult;
    },
  };
}

/** Remote persistence client. The service endpoint owns its durable database and transactions. */
export function createHttpPersistenceAdapter(options: DeploymentHttpOptions): PersistenceAdapter {
  const client = httpClient(options);
  return {
    async loadPlayer(playerId) { return (await client("/v1/persistence/player/load", { id: playerId })).value ?? null; },
    async savePlayer(playerId, value) { await client("/v1/persistence/player/save", { id: playerId, value }); },
    async loadRoom(roomId) { return (await client("/v1/persistence/room/load", { id: roomId })).value ?? null; },
    async saveRoom(roomId, value) { await client("/v1/persistence/room/save", { id: roomId, value }); },
    async appendEvent(value) { await client("/v1/persistence/event/append", { value }); },
  };
}

/** Loads versioned session and backup key rings from an external key-management boundary. */
export function createHttpKeyManager(options: DeploymentHttpOptions): { load(): Promise<DeploymentKeyRing> } {
  const client = httpClient(options);
  return {
    async load() {
      const payload = record(await client("/v1/keys/load", {}));
      const sessionKeys = decodeKeyArray(payload.sessionKeys, "sessionKeys") as SessionSigningKey[];
      const backupKeys = decodeKeyArray(payload.backupKeys, "backupKeys") as BackupEncryptionKey[];
      const activeSessionKeyId = text(payload.activeSessionKeyId, "activeSessionKeyId");
      const activeBackupKeyId = text(payload.activeBackupKeyId, "activeBackupKeyId");
      if (!sessionKeys.some((key) => key.id === activeSessionKeyId)) throw new Error("Active session key is absent from the loaded key ring.");
      if (!backupKeys.some((key) => key.id === activeBackupKeyId)) throw new Error("Active backup key is absent from the loaded key ring.");
      return { activeSessionKeyId, activeBackupKeyId, sessionKeys, backupKeys, version: text(payload.version, "version") };
    },
  };
}

/** Calls the deployment actuator after deterministic regional scaling policy evaluation. */
export function createRegionalAutoscaler(
  policy: RegionalScalingPolicy,
  actuate: (decision: RegionalScaleDecision) => Promise<void>,
  now: () => number = Date.now,
): { evaluate(sample: RegionalCapacitySample): Promise<RegionalScaleDecision> } {
  const minimum = integer(policy.minInstances, 1, 100_000, "minInstances");
  const maximum = integer(policy.maxInstances, minimum, 100_000, "maxInstances");
  const target = range(policy.targetUtilization ?? 0.7, 0.1, 0.95, "targetUtilization");
  const outStep = integer(policy.scaleOutStep ?? 1, 1, maximum, "scaleOutStep");
  const inStep = integer(policy.scaleInStep ?? 1, 1, maximum, "scaleInStep");
  const queuePerInstance = integer(policy.queuePerInstance ?? 100, 1, 1_000_000, "queuePerInstance");
  const cooldown = integer(policy.cooldownMs ?? 60_000, 0, 24 * 60 * 60_000, "cooldownMs");
  const lastAction = new Map<string, number>();
  return {
    async evaluate(sample) {
      validateSample(sample);
      const at = integer(now(), 0, Number.MAX_SAFE_INTEGER, "autoscaler clock");
      let desired = Math.max(minimum, sample.currentInstances);
      let reason: RegionalScaleDecision["reason"] = sample.currentInstances < minimum ? "minimum" : "stable";
      const previous = lastAction.get(sample.region);
      if (previous !== undefined && at - previous < cooldown) reason = "cooldown";
      else if (sample.queueDepth > sample.readyInstances * queuePerInstance) { desired += outStep; reason = "queue"; }
      else if (sample.utilization > target) { desired += outStep; reason = "utilization-high"; }
      else if (sample.utilization < target * 0.5 && sample.queueDepth === 0 && desired > minimum) { desired -= inStep; reason = "utilization-low"; }
      desired = Math.min(maximum, Math.max(minimum, desired));
      const decision = { ...sample, desiredInstances: desired, reason, at };
      if (desired !== sample.currentInstances && reason !== "cooldown") { await actuate(decision); lastAction.set(sample.region, at); }
      return decision;
    },
  };
}

export function createHttpCapacityActuator(options: DeploymentHttpOptions): (decision: RegionalScaleDecision) => Promise<void> {
  const client = httpClient(options);
  return async (decision) => { await client("/v1/capacity/desired", decision); };
}

export function createHttpRegionCoordinator(options: DeploymentHttpOptions): {
  heartbeat(input: { nodeId: string; region: string; endpoint: string; capacity: number; load: number; ttlMs: number }): Promise<void>;
  acquireLease(input: { name: string; nodeId: string; region: string; ttlMs: number }): Promise<{ acquired: boolean; holder: string; expiresAt: number }>;
} {
  const client = httpClient(options);
  return {
    async heartbeat(input) { await client("/v1/regions/heartbeat", input); },
    async acquireLease(input) {
      const payload = record(await client("/v1/regions/lease", input));
      return { acquired: payload.acquired === true, holder: text(payload.holder, "holder"), expiresAt: integer(payload.expiresAt, 0, Number.MAX_SAFE_INTEGER, "expiresAt") };
    },
  };
}

/** Startup guard: staffing is configuration owned by real people, not a boolean deployment flag. */
export function validateOnCallRoster(roster: OnCallRoster, at = Date.now()): OnCallRoster {
  const primary = validateOperator(roster.primary, "primary");
  const secondary = validateOperator(roster.secondary, "secondary");
  if (primary.id === secondary.id || primary.pagingTarget === secondary.pagingTarget) throw new Error("Primary and secondary on-call operators must be independently pageable people.");
  const startsAt = integer(roster.startsAt, 0, Number.MAX_SAFE_INTEGER, "startsAt");
  const endsAt = integer(roster.endsAt, startsAt + 1, Number.MAX_SAFE_INTEGER, "endsAt");
  at = integer(at, 0, Number.MAX_SAFE_INTEGER, "roster clock");
  if (at < startsAt || at >= endsAt) throw new Error("No active primary/secondary on-call roster covers the current time.");
  const escalationPolicyUrl = https(roster.escalationPolicyUrl, "escalationPolicyUrl");
  const runbookUrl = https(roster.runbookUrl, "runbookUrl");
  return { primary, secondary, startsAt, endsAt, escalationPolicyUrl, runbookUrl };
}

function httpClient(options: DeploymentHttpOptions) {
  const endpoint = new URL(options.endpoint);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") throw new Error("Deployment endpoint must use HTTPS outside localhost.");
  const token = text(options.bearerToken, "bearerToken");
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = integer(options.timeoutMs ?? 5_000, 100, 60_000, "timeoutMs");
  return async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const signal = AbortSignal.timeout(timeoutMs);
    const response = await fetcher(new URL(path, endpoint), {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal,
    });
    if (!response.ok) throw new Error(`Deployment control plane ${path} failed with HTTP ${response.status}.`);
    return record(await response.json());
  };
}

function decodeKeyArray(value: unknown, label: string): Array<{ id: string; secret: Uint8Array }> {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array.`);
  const ids = new Set<string>();
  return value.map((candidate, index) => {
    const item = record(candidate); const id = text(item.id, `${label}[${index}].id`);
    if (ids.has(id)) throw new Error(`${label} contains duplicate key ${id}.`); ids.add(id);
    const encoded = text(item.secretBase64, `${label}[${index}].secretBase64`);
    const secret = Uint8Array.fromBase64(encoded);
    if (secret.byteLength < 32) throw new Error(`${label}[${index}] secret must contain at least 32 bytes.`);
    return { id, secret };
  });
}

function encodeKeyArray(keys: readonly { id: string; secret: Uint8Array }[]) { return keys.map((key) => ({ id: key.id, secretBase64: key.secret.toBase64() })); }

function constantTimeTextEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder(), a = encoder.encode(left), b = encoder.encode(right); let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index % Math.max(1, a.length)] ?? 0) ^ (b[index % Math.max(1, b.length)] ?? 0);
  return difference === 0;
}

function response(value: unknown, status = 200): Response { return Response.json(value, { status, headers: { "cache-control": "no-store" } }); }

function validateSample(sample: RegionalCapacitySample): void {
  text(sample.region, "region"); integer(sample.currentInstances, 0, 100_000, "currentInstances");
  integer(sample.readyInstances, 0, sample.currentInstances, "readyInstances"); range(sample.utilization, 0, 1, "utilization");
  integer(sample.queueDepth, 0, Number.MAX_SAFE_INTEGER, "queueDepth");
}

function heartbeatInput(body: Record<string, any>): Parameters<RegionCoordinatorBackend["heartbeat"]>[0] {
  const endpoint = new URL(text(body.endpoint, "endpoint"));
  if (endpoint.protocol !== "https:") throw new Error("endpoint must use HTTPS.");
  const capacity = integer(body.capacity, 1, 1_000_000, "capacity");
  return {
    nodeId: text(body.nodeId, "nodeId"), region: text(body.region, "region"), endpoint: endpoint.href,
    capacity, load: integer(body.load, 0, capacity, "load"), ttlMs: integer(body.ttlMs, 1_000, 24 * 60 * 60_000, "ttlMs"),
  };
}

function leaseInput(body: Record<string, any>): Parameters<RegionCoordinatorBackend["acquireLease"]>[0] {
  return {
    name: text(body.name, "name"), nodeId: text(body.nodeId, "nodeId"), region: text(body.region, "region"),
    ttlMs: integer(body.ttlMs, 1_000, 24 * 60 * 60_000, "ttlMs"),
  };
}

function scaleDecision(body: Record<string, any>): RegionalScaleDecision {
  const sample = {
    region: text(body.region, "region"),
    currentInstances: integer(body.currentInstances, 0, 100_000, "currentInstances"),
    readyInstances: integer(body.readyInstances, 0, 100_000, "readyInstances"),
    utilization: range(body.utilization, 0, 1, "utilization"),
    queueDepth: integer(body.queueDepth, 0, Number.MAX_SAFE_INTEGER, "queueDepth"),
  };
  validateSample(sample);
  const desiredInstances = integer(body.desiredInstances, 0, 100_000, "desiredInstances");
  const allowed = new Set<RegionalScaleDecision["reason"]>(["queue", "utilization-high", "utilization-low", "minimum", "stable", "cooldown"]);
  const reason = text(body.reason, "reason") as RegionalScaleDecision["reason"];
  if (!allowed.has(reason)) throw new Error("reason is not a supported autoscaling decision.");
  return { ...sample, desiredInstances, reason, at: integer(body.at, 0, Number.MAX_SAFE_INTEGER, "at") };
}

function validateOperator(value: OnCallOperator, label: string): OnCallOperator {
  return { id: text(value?.id, `${label}.id`), displayName: text(value?.displayName, `${label}.displayName`), pagingTarget: text(value?.pagingTarget, `${label}.pagingTarget`) };
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Deployment control plane returned a non-object payload.");
  return value as Record<string, any>;
}

function text(value: unknown, label: string): string { if (typeof value !== "string" || value.trim().length === 0 || value.length > 4096) throw new Error(`${label} must be bounded non-empty text.`); return value; }
function integer(value: unknown, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(`${label} must be an integer from ${minimum} through ${maximum}.`); return value as number; }
function range(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be from ${minimum} through ${maximum}.`); return value; }
function https(value: unknown, label: string): string { const result = text(value, label); if (new URL(result).protocol !== "https:") throw new Error(`${label} must use HTTPS.`); return result; }

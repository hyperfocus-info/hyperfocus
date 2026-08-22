export type ShardZone = {
  id: string;
  roomId: string;
  endpoint?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  label?: string;
};

export type ShardHandoffRequest = {
  playerId: string;
  fromRoomId: string;
  target: ShardZone;
  state: unknown;
};

export type ShardHandoffResult = {
  ok: boolean;
  playerId: string;
  fromRoomId: string;
  toRoomId: string;
  state: unknown;
  target: ShardZone;
  reason?: string;
};

export type ShardHandoffTransport = {
  handoff(request: ShardHandoffRequest): Promise<ShardHandoffResult>;
};

export type ShardHandoffFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ShardRouterOptions = {
  strategy: "static-grid" | "room-label";
  zones: readonly ShardZone[];
  handoffTimeoutMs?: number;
  transport?: ShardHandoffTransport;
};

export type ShardRouter = {
  route(position: { x: number; y: number }, label?: string): ShardZone | undefined;
  handoff(playerId: string, fromRoomId: string, target: ShardZone, state: unknown): Promise<ShardHandoffResult>;
};

function localHandoff(request: ShardHandoffRequest): ShardHandoffResult {
  return {
    ok: true,
    playerId: request.playerId,
    fromRoomId: request.fromRoomId,
    toRoomId: request.target.roomId,
    target: request.target,
    state: request.state
  };
}

function timeoutResult(request: ShardHandoffRequest): ShardHandoffResult {
  return {
    ok: false,
    playerId: request.playerId,
    fromRoomId: request.fromRoomId,
    toRoomId: request.target.roomId,
    target: request.target,
    state: request.state,
    reason: "shard handoff timed out"
  };
}

async function withTimeout(request: ShardHandoffRequest, timeoutMs: number | undefined, handoff: Promise<ShardHandoffResult>) {
  if (!timeoutMs || timeoutMs <= 0) return handoff;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      handoff,
      new Promise<ShardHandoffResult>((resolve) => {
        timeout = setTimeout(() => resolve(timeoutResult(request)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createShardRouter(options: ShardRouterOptions): ShardRouter {
  return {
    route(position, label) {
      if (options.strategy === "room-label") return options.zones.find((zone) => zone.label === label);
      return options.zones.find((zone) => {
        const x = zone.x ?? 0;
        const y = zone.y ?? 0;
        const w = zone.w ?? 0;
        const h = zone.h ?? 0;
        return position.x >= x && position.y >= y && position.x < x + w && position.y < y + h;
      });
    },
    async handoff(playerId, fromRoomId, target, state) {
      const request = { playerId, fromRoomId, target, state };
      const handoff = options.transport ? options.transport.handoff(request) : Promise.resolve(localHandoff(request));
      return withTimeout(request, options.handoffTimeoutMs, handoff);
    }
  };
}

export function createHttpShardHandoffTransport(options: {
  path?: string;
  fetch?: ShardHandoffFetch;
  headers?: HeadersInit;
} = {}): ShardHandoffTransport {
  const send = options.fetch ?? fetch;
  return {
    async handoff(request) {
      if (!request.target.endpoint) return { ...localHandoff(request), ok: false, reason: "target shard endpoint missing" };
      try {
        const headers = new Headers(options.headers);
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
        const response = await send(new URL(options.path ?? "/shard/handoff", request.target.endpoint), {
          method: "POST",
          headers,
          body: JSON.stringify(request)
        });
        if (!response.ok) return { ...localHandoff(request), ok: false, reason: `target shard rejected handoff: ${response.status}` };
        const payload = (await response.json()) as Partial<ShardHandoffResult>;
        const hasState = Object.prototype.hasOwnProperty.call(payload, "state");
        return {
          ...localHandoff(request),
          ...payload,
          ok: payload.ok ?? true,
          toRoomId: payload.toRoomId ?? request.target.roomId,
          target: payload.target ?? request.target,
          state: hasState ? payload.state : request.state
        };
      } catch (error) {
        return { ...localHandoff(request), ok: false, reason: error instanceof Error ? error.message : "shard handoff failed" };
      }
    }
  };
}

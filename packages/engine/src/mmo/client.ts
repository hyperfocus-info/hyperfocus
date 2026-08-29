import { connectAuthoritative, type AuthoritativeClient, type AuthoritativeSession } from "../net/authoritative-client.ts";
import type { ReplicationSchema } from "../protocol/schema.ts";
import type { EntityInterpolator } from "./interpolation.ts";
import type { MmoInputMapper, MmoMappedInput } from "./input.ts";
import type { MmoEntityData, MmoReplicatedEntity } from "./types.ts";

export type MmoClientTransport<TState, TInput> = {
  connect(): Promise<void | AuthoritativeSession>;
  close(): void;
  sendInput(input: TInput): void;
  onSnapshot(listener: (state: TState) => void): () => void;
  onDelta?: (listener: (state: TState) => void) => () => void;
};

export type MmoClientConfig<
  TState,
  TInput extends MmoMappedInput = MmoMappedInput,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
> = {
  url?: string;
  token?: string;
  roomId?: string;
  roomType?: string;
  schema?: ReplicationSchema<TState>;
  WebSocketImpl?: typeof WebSocket;
  transport?: MmoClientTransport<TState, TInput>;
  inputMapper?: MmoInputMapper<TInput>;
  interpolator?: EntityInterpolator<TPublic, TOwner>;
  selectEntities?: (state: TState) => Record<string, MmoReplicatedEntity<TPublic, TOwner>> | undefined;
  now?: () => number;
};

export type MmoClient<
  TState,
  TInput extends MmoMappedInput = MmoMappedInput,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
> = {
  connect(): Promise<void | AuthoritativeSession>;
  close(): void;
  sendInput(input: TInput): void;
  mapAndSendInput(context: Parameters<MmoInputMapper<TInput>["map"]>[0]): TInput;
  onState(listener: (state: TState) => void): () => void;
  getState(): TState | undefined;
  sampleEntities(nowMs?: number): Record<string, MmoReplicatedEntity<TPublic, TOwner>> | undefined;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isReplicatedEntity(value: unknown): value is MmoReplicatedEntity {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.type !== "string"
    || typeof value.x !== "number" || !Number.isFinite(value.x)
    || typeof value.y !== "number" || !Number.isFinite(value.y)
    || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0
    || (value.visibility !== "public" && value.visibility !== "owner")
    || (value.visibility === "owner" && typeof value.ownerId !== "string")
    || (value.ownerId !== undefined && typeof value.ownerId !== "string")
    || (value.zoneId !== undefined && typeof value.zoneId !== "string")
    || !isOptionalFiniteNumber(value.radius)
    || !isOptionalFiniteNumber(value.priority)
    || (value.global !== undefined && typeof value.global !== "boolean")
    || (value.tags !== undefined && (!Array.isArray(value.tags) || !value.tags.every((tag) => typeof tag === "string")))
    || (value.publicData !== undefined && !isRecord(value.publicData))
    || (value.ownerData !== undefined && !isRecord(value.ownerData))) return false;
  return true;
}

function stateEntities(state: unknown): Record<string, MmoReplicatedEntity> | undefined {
  if (!isRecord(state) || !isRecord(state.entities)) return undefined;
  const entities: Record<string, MmoReplicatedEntity> = {};
  for (const [id, value] of Object.entries(state.entities)) {
    if (!isReplicatedEntity(value) || value.id !== id) return undefined;
    entities[id] = value;
  }
  return entities;
}

function pushDefaultEntities(
  interpolator: EntityInterpolator,
  entities: Record<string, MmoReplicatedEntity>,
  receivedAtMs: number
): void {
  interpolator.pushSnapshot({ entities }, receivedAtMs);
}

function authoritativeTransport<TState, TInput extends MmoMappedInput>(config: MmoClientConfig<TState, TInput>): MmoClientTransport<TState, TInput> {
  if (!config.url || !config.token) throw new Error("createMmoClient requires url and token when no transport is provided");
  const client: AuthoritativeClient<TState> = connectAuthoritative<TState>({
    url: config.url,
    token: config.token,
    roomId: config.roomId,
    roomType: config.roomType,
    schema: config.schema,
    WebSocketImpl: config.WebSocketImpl
  });
  return {
    connect: () => client.connect(),
    close: () => client.close(),
    sendInput: (input) => client.sendInput(input),
    onSnapshot(listener) {
      return client.onSnapshot((state) => listener(state));
    },
    onDelta(listener) {
      return client.onDelta((state) => listener(state));
    }
  };
}

export function createMmoClient<
  TState,
  TInput extends MmoMappedInput = MmoMappedInput,
  TPublic extends MmoEntityData = MmoEntityData,
  TOwner extends MmoEntityData = MmoEntityData
>(config: MmoClientConfig<TState, TInput, TPublic, TOwner>): MmoClient<TState, TInput, TPublic, TOwner> {
  const listeners = new Set<(state: TState) => void>();
  const transport = config.transport ?? authoritativeTransport(config);
  const now = config.now ?? (() => performance.now());
  let state: TState | undefined;
  let unsubscribers: Array<() => void> = [];

  function receiveState(next: TState) {
    state = next;
    if (config.interpolator) {
      const receivedAtMs = now();
      if (config.selectEntities) {
        const entities = config.selectEntities(next);
        if (entities) config.interpolator.pushSnapshot({ entities }, receivedAtMs);
      } else {
        const entities = stateEntities(next);
        if (entities) pushDefaultEntities(config.interpolator, entities, receivedAtMs);
      }
    }
    for (const listener of listeners) listener(next);
  }

  function runUnsubscribers(subscriptions: Array<() => void>) {
    const errors: unknown[] = [];
    for (const unsubscribe of subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  function throwLifecycleErrors(message: string, errors: unknown[]) {
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, message);
  }

  function subscribeToTransport() {
    if (unsubscribers.length > 0) return;
    const subscriptions: Array<() => void> = [];
    try {
      const unsubscribeSnapshot = transport.onSnapshot(receiveState);
      if (typeof unsubscribeSnapshot !== "function") throw new Error("MMO client snapshot subscription must return an unsubscribe function");
      subscriptions.push(unsubscribeSnapshot);
      if (transport.onDelta) {
        const unsubscribeDelta = transport.onDelta(receiveState);
        if (typeof unsubscribeDelta !== "function") throw new Error("MMO client delta subscription must return an unsubscribe function");
        subscriptions.push(unsubscribeDelta);
      }
      unsubscribers = subscriptions;
    } catch (error) {
      const cleanupErrors = runUnsubscribers(subscriptions);
      if (cleanupErrors.length > 0) throw new AggregateError([error, ...cleanupErrors], "MMO client subscription setup and cleanup failed");
      throw error;
    }
  }

  function unsubscribeFromTransport() {
    const subscriptions = unsubscribers;
    unsubscribers = [];
    return runUnsubscribers(subscriptions);
  }

  subscribeToTransport();

  return {
    connect() {
      subscribeToTransport();
      return transport.connect();
    },
    close() {
      const errors = unsubscribeFromTransport();
      try {
        transport.close();
      } catch (error) {
        errors.push(error);
      }
      throwLifecycleErrors("MMO client close failed", errors);
    },
    sendInput(input) {
      transport.sendInput(input);
    },
    mapAndSendInput(context) {
      if (!config.inputMapper) throw new Error("createMmoClient mapAndSendInput requires inputMapper");
      const input = config.inputMapper.map(context);
      transport.sendInput(input);
      return input;
    },
    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      return state;
    },
    sampleEntities(sampleAt = now()) {
      return config.interpolator?.sample(sampleAt);
    }
  };
}

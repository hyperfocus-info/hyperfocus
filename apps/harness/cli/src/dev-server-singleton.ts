type DevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell> = {
  version: number;
  runtimeContractVersion?: number;
  state: TState;
  handlerRefs: THandlerRefs;
  server: TServer;
  browserOpenedOnce: boolean;
  websocketShell: TWebSocketShell;
  pendingState?: TState;
  pendingHandlerRefs?: THandlerRefs;
  pendingApplyTimer?: number;
  pendingApplyBackoffStep?: number;
  trackedHotReloadSnapshot?: Map<string, number>;
};

const DEV_HARNESS_SERVER_SINGLETON_KEY = Symbol.for("pi-harness.dev-server");

export function getDevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>() {
  const value: unknown = Reflect.get(globalThis, DEV_HARNESS_SERVER_SINGLETON_KEY);
  return isDevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>(value) ? value : undefined;
}

export function setDevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>(
  singleton: DevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>
) {
  Reflect.set(globalThis, DEV_HARNESS_SERVER_SINGLETON_KEY, singleton);
  return singleton;
}

export function clearDevHarnessServerSingleton() {
  Reflect.deleteProperty(globalThis, DEV_HARNESS_SERVER_SINGLETON_KEY);
}

function isDevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell>(
  value: unknown
): value is DevHarnessServerSingleton<TState, THandlerRefs, TServer, TWebSocketShell> {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "version") === "number"
    && "state" in value && "handlerRefs" in value && "server" in value && "websocketShell" in value
    && typeof Reflect.get(value, "browserOpenedOnce") === "boolean";
}

import type { AgentId } from "@hyperfocus/ai-core/protocol";
import type { AgentRuntime } from "./agent-runtime";
import type { PiAgentAdapter } from "../pi-agent-adapter";

export function createAgentRuntimeRegistry(
  runtimes: AgentRuntime[],
  options: { decorateAdapter?: (adapter: PiAgentAdapter) => PiAgentAdapter } = {}
) {
  const decorateAdapter = options.decorateAdapter;
  const decoratedAdapters = new WeakMap<PiAgentAdapter, PiAgentAdapter>();
  const resolvedRuntimes = decorateAdapter
    ? runtimes.map((runtime): AgentRuntime => ({
        ...runtime,
        getAdapter() {
          const source = runtime.getAdapter();
          const existing = decoratedAdapters.get(source);
          if (existing) return existing;
          const decorated = decorateAdapter(source);
          decoratedAdapters.set(source, decorated);
          return decorated;
        }
      }))
    : runtimes;
  const get = (agentId: AgentId) => {
    const runtime = resolvedRuntimes.find((entry) => entry.id === agentId);
    if (!runtime) {
      throw new Error(`Unknown agent runtime: ${agentId}`);
    }

    return runtime;
  };

  const list = () => [...resolvedRuntimes];

  const listCapabilities = () =>
    resolvedRuntimes.flatMap((runtime) => {
      const capability = runtime.getCapability();
      return capability ? [capability] : [];
    });

  const refreshAll = async () => {
    const capabilities = await Promise.all(resolvedRuntimes.map((runtime) => runtime.refreshCapability()));
    return capabilities.sort((left, right) => left.label.localeCompare(right.label));
  };

  const refresh = (agentId: AgentId) => get(agentId).refreshCapability();

  return { get, list, listCapabilities, refreshAll, refresh };
}

export type AgentRuntimeRegistry = ReturnType<typeof createAgentRuntimeRegistry>;

export function decorateAgentRuntimeRegistry(
  registry: AgentRuntimeRegistry,
  decorateAdapter: (adapter: PiAgentAdapter) => PiAgentAdapter
): AgentRuntimeRegistry {
  const decoratedRuntimes = new WeakMap<AgentRuntime, AgentRuntime>();
  const decorateRuntime = (runtime: AgentRuntime) => {
    const existing = decoratedRuntimes.get(runtime);
    if (existing) return existing;
    const decorated: AgentRuntime = {
      ...runtime,
      getAdapter: () => decorateAdapter(runtime.getAdapter())
    };
    decoratedRuntimes.set(runtime, decorated);
    return decorated;
  };
  return {
    get: (agentId) => decorateRuntime(registry.get(agentId)),
    list: () => registry.list().map(decorateRuntime),
    listCapabilities: () => registry.listCapabilities(),
    refreshAll: () => registry.refreshAll(),
    refresh: (agentId) => registry.refresh(agentId)
  };
}

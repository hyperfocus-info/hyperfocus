import { createHttpShardHandoffTransport, type ShardHandoffFetch, type ShardHandoffTransport, type ShardZone } from "./shard-router.ts";

export type FleetNode = {
  id: string;
  endpoint: string;
  region?: string;
  capacity: number;
  load: number;
  healthy?: boolean;
};

export type FleetPlacement = {
  nodeId: string;
  zone: ShardZone;
};

export type FleetManager = {
  upsertNode(node: FleetNode): void;
  removeNode(nodeId: string): boolean;
  placeZone(zone: Omit<ShardZone, "endpoint">, options?: { region?: string }): FleetPlacement | undefined;
  recordLoad(nodeId: string, load: number): boolean;
  nodes(): FleetNode[];
  createHandoffTransport(options?: { path?: string; headers?: HeadersInit; fetch?: ShardHandoffFetch }): ShardHandoffTransport;
};

export function createFleetManager(initialNodes: readonly FleetNode[] = []): FleetManager {
  const nodes = new Map<string, FleetNode>();
  for (const node of initialNodes) nodes.set(node.id, { ...node });

  function candidates(region?: string) {
    return [...nodes.values()]
      .filter((node) => node.healthy !== false && node.load < node.capacity && (!region || node.region === region))
      .sort((a, b) => a.load / a.capacity - b.load / b.capacity || a.id.localeCompare(b.id));
  }

  return {
    upsertNode(node) {
      nodes.set(node.id, { ...node });
    },
    removeNode(nodeId) {
      return nodes.delete(nodeId);
    },
    placeZone(zone, options) {
      const node = candidates(options?.region)[0] ?? candidates()[0];
      if (!node) return undefined;
      node.load += 1;
      return { nodeId: node.id, zone: { ...zone, endpoint: node.endpoint } };
    },
    recordLoad(nodeId, load) {
      const node = nodes.get(nodeId);
      if (!node) return false;
      node.load = Math.max(0, load);
      return true;
    },
    nodes() {
      return [...nodes.values()].map((node) => ({ ...node }));
    },
    createHandoffTransport(options = {}) {
      return createHttpShardHandoffTransport(options);
    }
  };
}

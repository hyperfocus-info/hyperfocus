export type RoamWaypoint3D = { id: string; position: readonly [number, number, number] };
export type RoamLink3D = {
  id: string;
  from: string;
  to: string;
  /** Off-mesh actions are executed by the game after reaching the source. */
  traversal?: string;
  cost?: number;
  bidirectional?: boolean;
};

function identifier(value: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new Error("Navigation identifiers must contain 1–128 characters");
  }
}

/** Authored waypoint routing, not automatic navmesh generation or collision avoidance. */
export function createRoamNavigator3D(options: {
  waypoints: readonly RoamWaypoint3D[];
  links: readonly RoamLink3D[];
  maxVisited?: number;
  maxPathLength?: number;
}) {
  const maxVisited = options.maxVisited ?? 4096;
  const maxPathLength = options.maxPathLength ?? 1024;
  for (const limit of [maxVisited, maxPathLength]) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Navigation limits must be positive integers");
  }
  if (options.waypoints.length > 65536 || options.links.length > 262144) {
    throw new Error("Navigation graph exceeds 65536 waypoints or 262144 links");
  }
  const nodes = new Map<string, RoamWaypoint3D>();
  const edges = new Map<string, { id: string; to: string; cost: number; traversal: string }[]>();
  for (const node of options.waypoints) {
    identifier(node.id);
    if (nodes.has(node.id)) throw new Error(`Duplicate waypoint: ${node.id}`);
    if (node.position.length !== 3 || !node.position.every(Number.isFinite)) throw new Error(`Invalid waypoint: ${node.id}`);
    nodes.set(node.id, { id: node.id, position: [...node.position] });
    edges.set(node.id, []);
  }
  const ids = new Set<string>();
  for (const link of options.links) {
    identifier(link.id);
    if (link.bidirectional !== undefined && typeof link.bidirectional !== "boolean") throw new Error(`Invalid direction: ${link.id}`);
    if (ids.has(link.id)) throw new Error(`Duplicate link: ${link.id}`);
    ids.add(link.id);
    const from = nodes.get(link.from);
    const to = nodes.get(link.to);
    if (!from || !to) throw new Error(`Unknown endpoint for link: ${link.id}`);
    const cost = link.cost ?? Math.hypot(...from.position.map((value, axis) => value - (to.position[axis] ?? 0)));
    if (!Number.isFinite(cost) || cost < 0) throw new Error(`Invalid cost: ${link.id}`);
    const traversal = link.traversal ?? "walk";
    identifier(traversal);
    edges.get(link.from)?.push({ id: link.id, to: link.to, cost, traversal });
    if (link.bidirectional ?? true) edges.get(link.to)?.push({ id: link.id, to: link.from, cost, traversal });
  }
  for (const list of edges.values()) list.sort((a, b) => compare(a.id, b.id) || compare(a.to, b.to));

  return {
    route(request: { from: string; to: string; traversals?: readonly string[]; blockedLinks?: readonly string[] }) {
      if (!nodes.has(request.from) || !nodes.has(request.to)) throw new Error("Unknown route endpoint");
      const allowed = new Set(request.traversals ?? ["walk"]);
      const blocked = new Set(request.blockedLinks ?? []);
      const costs = new Map([[request.from, 0]]);
      const pending = new Set([request.from]);
      const previous = new Map<string, { from: string; link: string; traversal: string }>();
      const visited = new Set<string>();
      while (pending.size > 0) {
        if (visited.size >= maxVisited) return { status: "budget-exceeded" as const, visited: visited.size };
        let current = "";
        let best = Infinity;
        for (const id of pending) {
          const cost = costs.get(id) ?? Infinity;
          if (cost < best || (cost === best && compare(id, current) < 0)) { current = id; best = cost; }
        }
        pending.delete(current);
        visited.add(current);
        if (current === request.to) {
          const steps: { waypoint: string; position: readonly [number, number, number]; link: string; traversal: string }[] = [];
          let cursor = current;
          while (cursor !== request.from) {
            if (steps.length >= maxPathLength) return { status: "path-too-long" as const, visited: visited.size };
            const prior = previous.get(cursor);
            const node = nodes.get(cursor);
            if (!prior || !node) throw new Error("Navigation predecessor invariant failed");
            steps.push({ waypoint: cursor, position: [...node.position], link: prior.link, traversal: prior.traversal });
            cursor = prior.from;
          }
          return { status: "found" as const, cost: best, steps: steps.reverse(), visited: visited.size };
        }
        for (const edge of edges.get(current) ?? []) {
          if (visited.has(edge.to) || blocked.has(edge.id) || !allowed.has(edge.traversal)) continue;
          const cost = best + edge.cost;
          if (!Number.isFinite(cost)) throw new Error("Navigation route cost overflow");
          if (cost >= (costs.get(edge.to) ?? Infinity)) continue;
          costs.set(edge.to, cost);
          previous.set(edge.to, { from: current, link: edge.id, traversal: edge.traversal });
          pending.add(edge.to);
        }
      }
      return { status: "unreachable" as const, visited: visited.size };
    },
  };
}

function compare(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }

export interface PathPredictorOptions {
  nodeCount: number;
  capacity?: number;
  maxPathLength?: number;
}

export type PredictedPathStatus = "hit" | "miss" | "blocked" | "cycle" | "output-too-small";

export interface PredictedPathResult {
  readonly status: PredictedPathStatus;
  readonly length: number;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer.`);
  return value;
}

/** Creates a fixed-memory learned next-hop table for repeated routes. */
export function createPathPredictor(options: PathPredictorOptions) {
  const nodeCount = positiveInteger(options.nodeCount, "nodeCount");
  const capacity = positiveInteger(options.capacity ?? Math.min(nodeCount * 4, 65_536), "capacity");
  const maxPathLength = positiveInteger(options.maxPathLength ?? Math.min(nodeCount, 4_096), "maxPathLength");
  const nodes = new Int32Array(capacity); nodes.fill(-1);
  const goals = new Int32Array(capacity); goals.fill(-1);
  const nextNodes = new Int32Array(capacity); nextNodes.fill(-1);
  const confidenceValues = new Uint16Array(capacity);
  const scratch = new Int32Array(maxPathLength);
  const nodeValue = (value: number, label: string) => {
    if (!Number.isSafeInteger(value) || value < 0 || value >= nodeCount) throw new RangeError(`${label} is outside nodeCount.`);
    return value;
  };
  const hash = (node: number, goal: number) => ((Math.imul(node + 1, 73_856_093) ^ Math.imul(goal + 1, 19_349_663)) >>> 0) % capacity;
  // Lookups and training share the same probe order. Only training selects eviction.
  const lookup = (node: number, goal: number, training = false) => {
    const home = hash(node, goal);
    let replacement = home;
    for (let probe = 0; probe < capacity; probe += 1) {
      const slot = (home + probe) % capacity;
      if (nodes[slot] === node && goals[slot] === goal) return slot;
      if (nodes[slot] === -1) return training ? slot : -1;
      if (training && confidenceValues[slot] < confidenceValues[replacement]) replacement = slot;
    }
    return training ? replacement : -1;
  };
  const write = (slot: number, node: number, goal: number, next: number) => {
    if (nodes[slot] === node && goals[slot] === goal && nextNodes[slot] === next) {
      if (confidenceValues[slot] < 65_535) confidenceValues[slot] += 1;
      return;
    }
    nodes[slot] = node;
    goals[slot] = goal;
    nextNodes[slot] = next;
    confidenceValues[slot] = 1;
  };
  return Object.freeze({
    nodeCount,
    capacity,
    maxPathLength,
    train(path: ArrayLike<number>, length = path.length) {
      if (!Number.isSafeInteger(length) || length < 1 || length > path.length) throw new RangeError("path length is invalid.");
      const goal = nodeValue(path[length - 1], "goal");
      for (let index = 0; index + 1 < length; index += 1) {
        const node = nodeValue(path[index], `path[${index}]`);
        const next = nodeValue(path[index + 1], `path[${index + 1}]`);
        write(lookup(node, goal, true), node, goal, next);
      }
    },
    predict(start: number, goal: number, output: Int32Array, blocked?: ArrayLike<number>): PredictedPathResult {
      nodeValue(start, "start");
      nodeValue(goal, "goal");
      if (!(output instanceof Int32Array)) throw new TypeError("predicted path output must be an Int32Array.");
      if (blocked && blocked.length < nodeCount) throw new RangeError("blocked mask is smaller than nodeCount.");
      if (blocked?.[start] || blocked?.[goal]) return { status: "blocked", length: 0 };
      let length = 1;
      let node = start;
      scratch[0] = start;
      while (node !== goal) {
        const slot = lookup(node, goal);
        if (slot < 0) return { status: "miss", length: 0 };
        node = nextNodes[slot];
        if (blocked?.[node]) return { status: "blocked", length: 0 };
        for (let index = 0; index < length; index += 1) {
          if (scratch[index] === node) return { status: "cycle", length: 0 };
        }
        if (length >= scratch.length) return { status: "miss", length: 0 };
        scratch[length] = node;
        length += 1;
      }
      if (output.length < length) return { status: "output-too-small", length };
      output.set(scratch.subarray(0, length));
      return { status: "hit", length };
    },
    confidence(node: number, goal: number) {
      const slot = lookup(nodeValue(node, "node"), nodeValue(goal, "goal"));
      return slot < 0 ? 0 : confidenceValues[slot];
    },
    clear() {
      nodes.fill(-1);
      goals.fill(-1);
      nextNodes.fill(-1);
      confidenceValues.fill(0);
    },
  });
}

export type PathPredictor = ReturnType<typeof createPathPredictor>;

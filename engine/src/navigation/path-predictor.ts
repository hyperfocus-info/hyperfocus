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

/**
 * Fixed-memory learned next-hop table. Successful A* routes train it; repeated
 * routes can then bypass search, while blockers and incomplete predictions fall
 * back cleanly to the authoritative navigator.
 */
export class PathPredictor {
  readonly nodeCount: number;
  readonly capacity: number;
  readonly maxPathLength: number;
  readonly #nodes: Int32Array;
  readonly #goals: Int32Array;
  readonly #next: Int32Array;
  readonly #confidence: Uint16Array;
  readonly #scratch: Int32Array;

  constructor(options: PathPredictorOptions) {
    this.nodeCount = positiveInteger(options.nodeCount, "nodeCount");
    this.capacity = positiveInteger(options.capacity ?? Math.min(this.nodeCount * 4, 65_536), "capacity");
    this.maxPathLength = positiveInteger(options.maxPathLength ?? Math.min(this.nodeCount, 4_096), "maxPathLength");
    this.#nodes = new Int32Array(this.capacity); this.#nodes.fill(-1);
    this.#goals = new Int32Array(this.capacity); this.#goals.fill(-1);
    this.#next = new Int32Array(this.capacity); this.#next.fill(-1);
    this.#confidence = new Uint16Array(this.capacity);
    this.#scratch = new Int32Array(this.maxPathLength);
  }

  train(path: ArrayLike<number>, length = path.length): void {
    if (!Number.isSafeInteger(length) || length < 1 || length > path.length) throw new RangeError("path length is invalid.");
    const goal = this.#node(path[length - 1], "goal");
    for (let index = 0; index + 1 < length; index += 1) {
      const node = this.#node(path[index], `path[${index}]`);
      const next = this.#node(path[index + 1], `path[${index + 1}]`);
      this.#learn(node, goal, next);
    }
  }

  predict(start: number, goal: number, output: Int32Array, blocked?: ArrayLike<number>): PredictedPathResult {
    this.#node(start, "start");
    this.#node(goal, "goal");
    if (!(output instanceof Int32Array)) throw new TypeError("predicted path output must be an Int32Array.");
    if (blocked && blocked.length < this.nodeCount) throw new RangeError("blocked mask is smaller than nodeCount.");
    if (blocked?.[start] || blocked?.[goal]) return { status: "blocked", length: 0 };
    let length = 1;
    let node = start;
    this.#scratch[0] = start;
    while (node !== goal) {
      const slot = this.#lookup(node, goal);
      if (slot < 0) return { status: "miss", length: 0 };
      node = this.#next[slot];
      if (blocked?.[node]) return { status: "blocked", length: 0 };
      for (let index = 0; index < length; index += 1) {
        if (this.#scratch[index] === node) return { status: "cycle", length: 0 };
      }
      if (length >= this.#scratch.length) return { status: "miss", length: 0 };
      this.#scratch[length] = node;
      length += 1;
    }
    if (output.length < length) return { status: "output-too-small", length };
    output.set(this.#scratch.subarray(0, length));
    return { status: "hit", length };
  }

  confidence(node: number, goal: number): number {
    const slot = this.#lookup(this.#node(node, "node"), this.#node(goal, "goal"));
    return slot < 0 ? 0 : this.#confidence[slot];
  }

  clear(): void {
    this.#nodes.fill(-1);
    this.#goals.fill(-1);
    this.#next.fill(-1);
    this.#confidence.fill(0);
  }

  #learn(node: number, goal: number, next: number): void {
    const home = this.#hash(node, goal);
    let replacement = home;
    let lowestConfidence = this.#confidence[home];
    for (let probe = 0; probe < this.capacity; probe += 1) {
      const slot = (home + probe) % this.capacity;
      if (this.#nodes[slot] === -1 || (this.#nodes[slot] === node && this.#goals[slot] === goal)) {
        this.#write(slot, node, goal, next);
        return;
      }
      if (this.#confidence[slot] < lowestConfidence) {
        replacement = slot;
        lowestConfidence = this.#confidence[slot];
      }
    }
    this.#nodes[replacement] = node;
    this.#goals[replacement] = goal;
    this.#next[replacement] = next;
    this.#confidence[replacement] = 1;
  }

  #write(slot: number, node: number, goal: number, next: number): void {
    if (this.#nodes[slot] === node && this.#goals[slot] === goal && this.#next[slot] === next) {
      if (this.#confidence[slot] < 65_535) this.#confidence[slot] += 1;
      return;
    }
    this.#nodes[slot] = node;
    this.#goals[slot] = goal;
    this.#next[slot] = next;
    this.#confidence[slot] = 1;
  }

  #lookup(node: number, goal: number): number {
    const home = this.#hash(node, goal);
    for (let probe = 0; probe < this.capacity; probe += 1) {
      const slot = (home + probe) % this.capacity;
      if (this.#nodes[slot] === -1) return -1;
      if (this.#nodes[slot] === node && this.#goals[slot] === goal) return slot;
    }
    return -1;
  }

  #hash(node: number, goal: number): number {
    return ((Math.imul(node + 1, 73_856_093) ^ Math.imul(goal + 1, 19_349_663)) >>> 0) % this.capacity;
  }

  #node(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 0 || value >= this.nodeCount) throw new RangeError(`${label} is outside nodeCount.`);
    return value;
  }
}

export function createPathPredictor(options: PathPredictorOptions): PathPredictor {
  return new PathPredictor(options);
}

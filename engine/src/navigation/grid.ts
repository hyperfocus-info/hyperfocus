const SQRT2 = Math.SQRT2;

export type GridNavigatorOptions = {
  columns: number;
  rows: number;
  blocked?: Uint8Array;
  costs?: Float32Array;
  diagonal?: boolean;
  allowCornerCutting?: boolean;
  maxVisited?: number;
};

export type GridPathStatus = "found" | "not-found" | "budget-exceeded" | "output-too-small";

export type GridPathResult = {
  status: GridPathStatus;
  /** Number of indices required/written, including start and goal when found. */
  length: number;
  visited: number;
  cost: number;
};

/**
 * Reusable A* workspace for bounded rectangular grids. All search storage is
 * allocated once; callers provide the path output buffer.
 */
export class GridNavigator {
  readonly columns: number;
  readonly rows: number;
  readonly size: number;
  readonly diagonal: boolean;
  readonly allowCornerCutting: boolean;
  readonly maxVisited: number;
  readonly blocked: Uint8Array;
  readonly costs?: Float32Array;

  private readonly generation: Uint32Array;
  private readonly closedGeneration: Uint32Array;
  private readonly gScore: Float64Array;
  private readonly parents: Int32Array;
  private readonly heapNodes: Int32Array;
  private readonly heapScores: Float64Array;
  private readonly heapPositions: Int32Array;
  private queryGeneration = 0;
  private heapLength = 0;

  constructor(options: GridNavigatorOptions) {
    this.columns = positiveInteger(options.columns, "columns");
    this.rows = positiveInteger(options.rows, "rows");
    this.size = this.columns * this.rows;
    if (!Number.isSafeInteger(this.size) || this.size > 16_777_216) throw new Error("Grid navigator supports at most 16,777,216 cells.");
    this.diagonal = options.diagonal ?? false;
    this.allowCornerCutting = options.allowCornerCutting ?? false;
    this.maxVisited = positiveInteger(options.maxVisited ?? this.size, "maxVisited");
    this.blocked = options.blocked ?? new Uint8Array(this.size);
    if (this.blocked.length !== this.size) throw new Error("Blocked grid length does not match its dimensions.");
    if (options.costs) {
      if (options.costs.length !== this.size) throw new Error("Cost grid length does not match its dimensions.");
      for (const cost of options.costs) if (!Number.isFinite(cost) || cost < 1) throw new Error("Grid traversal costs must be finite numbers greater than or equal to 1.");
      this.costs = options.costs;
    }
    this.generation = new Uint32Array(this.size);
    this.closedGeneration = new Uint32Array(this.size);
    this.gScore = new Float64Array(this.size);
    this.parents = new Int32Array(this.size);
    this.heapNodes = new Int32Array(this.size);
    this.heapScores = new Float64Array(this.size);
    this.heapPositions = new Int32Array(this.size);
    this.heapPositions.fill(-1);
  }

  setBlocked(index: number, blocked: boolean) {
    this.assertIndex(index, "cell");
    this.blocked[index] = blocked ? 1 : 0;
  }

  findPath(start: number, goal: number, output: Int32Array): GridPathResult {
    this.assertIndex(start, "start");
    this.assertIndex(goal, "goal");
    if (!(output instanceof Int32Array)) throw new Error("Grid path output must be an Int32Array.");
    if (this.blocked[start] || this.blocked[goal]) return { status: "not-found", length: 0, visited: 0, cost: Infinity };
    if (start === goal) {
      if (!output.length) return { status: "output-too-small", length: 1, visited: 0, cost: 0 };
      output[0] = start;
      return { status: "found", length: 1, visited: 0, cost: 0 };
    }

    this.beginQuery();
    this.touch(start, 0, -1);
    this.pushOrDecrease(start, this.heuristic(start, goal));
    let visited = 0;
    while (this.heapLength) {
      const current = this.pop();
      if (this.closedGeneration[current] === this.queryGeneration) continue;
      this.closedGeneration[current] = this.queryGeneration;
      visited += 1;
      if (visited > this.maxVisited) return { status: "budget-exceeded", length: 0, visited: visited - 1, cost: Infinity };
      if (current === goal) return this.writePath(start, goal, output, visited);
      const column = current % this.columns;
      const row = Math.floor(current / this.columns);
      this.visitNeighbor(current, column - 1, row, 1, goal);
      this.visitNeighbor(current, column + 1, row, 1, goal);
      this.visitNeighbor(current, column, row - 1, 1, goal);
      this.visitNeighbor(current, column, row + 1, 1, goal);
      if (this.diagonal) {
        this.visitDiagonal(current, column, row, -1, -1, goal);
        this.visitDiagonal(current, column, row, 1, -1, goal);
        this.visitDiagonal(current, column, row, -1, 1, goal);
        this.visitDiagonal(current, column, row, 1, 1, goal);
      }
    }
    return { status: "not-found", length: 0, visited, cost: Infinity };
  }

  private beginQuery() {
    this.queryGeneration = (this.queryGeneration + 1) >>> 0;
    if (this.queryGeneration === 0) {
      this.generation.fill(0);
      this.closedGeneration.fill(0);
      this.queryGeneration = 1;
    }
    this.heapLength = 0;
  }

  private visitDiagonal(current: number, column: number, row: number, dx: number, dy: number, goal: number) {
    const nextColumn = column + dx;
    const nextRow = row + dy;
    if (!this.inBounds(nextColumn, nextRow)) return;
    if (!this.allowCornerCutting) {
      const horizontal = row * this.columns + nextColumn;
      const vertical = nextRow * this.columns + column;
      if (this.blocked[horizontal] || this.blocked[vertical]) return;
    }
    this.visitNeighbor(current, nextColumn, nextRow, SQRT2, goal);
  }

  private visitNeighbor(current: number, column: number, row: number, distance: number, goal: number) {
    if (!this.inBounds(column, row)) return;
    const next = row * this.columns + column;
    if (this.blocked[next] || this.closedGeneration[next] === this.queryGeneration) return;
    const nextCost = this.gScore[current] + distance * (this.costs?.[next] ?? 1);
    if (this.generation[next] === this.queryGeneration && nextCost >= this.gScore[next]) return;
    this.touch(next, nextCost, current);
    this.pushOrDecrease(next, nextCost + this.heuristic(next, goal));
  }

  private touch(index: number, score: number, parent: number) {
    if (this.generation[index] !== this.queryGeneration) this.heapPositions[index] = -1;
    this.generation[index] = this.queryGeneration;
    this.gScore[index] = score;
    this.parents[index] = parent;
  }

  private pushOrDecrease(node: number, score: number) {
    let position = this.heapPositions[node];
    if (position < 0) {
      position = this.heapLength++;
      this.heapNodes[position] = node;
      this.heapPositions[node] = position;
    }
    this.heapScores[position] = score;
    this.bubbleUp(position);
  }

  private pop() {
    const node = this.heapNodes[0];
    this.heapPositions[node] = -2;
    this.heapLength -= 1;
    if (this.heapLength) {
      const tail = this.heapNodes[this.heapLength];
      this.heapNodes[0] = tail;
      this.heapScores[0] = this.heapScores[this.heapLength];
      this.heapPositions[tail] = 0;
      this.bubbleDown(0);
    }
    return node;
  }

  private bubbleUp(start: number) {
    let position = start;
    while (position > 0) {
      const parent = (position - 1) >>> 1;
      if (!this.less(position, parent)) break;
      this.swap(position, parent);
      position = parent;
    }
  }

  private bubbleDown(start: number) {
    let position = start;
    while (true) {
      const left = position * 2 + 1;
      if (left >= this.heapLength) return;
      const right = left + 1;
      const smallest = right < this.heapLength && this.less(right, left) ? right : left;
      if (!this.less(smallest, position)) return;
      this.swap(position, smallest);
      position = smallest;
    }
  }

  private less(a: number, b: number) {
    return this.heapScores[a] < this.heapScores[b]
      || (this.heapScores[a] === this.heapScores[b] && this.heapNodes[a] < this.heapNodes[b]);
  }

  private swap(a: number, b: number) {
    const node = this.heapNodes[a];
    const score = this.heapScores[a];
    this.heapNodes[a] = this.heapNodes[b];
    this.heapScores[a] = this.heapScores[b];
    this.heapNodes[b] = node;
    this.heapScores[b] = score;
    this.heapPositions[this.heapNodes[a]] = a;
    this.heapPositions[this.heapNodes[b]] = b;
  }

  private writePath(start: number, goal: number, output: Int32Array, visited: number): GridPathResult {
    let length = 1;
    let cursor = goal;
    while (cursor !== start) {
      cursor = this.parents[cursor];
      if (cursor < 0 || length > this.size) throw new Error("Grid path parent chain is corrupt.");
      length += 1;
    }
    if (output.length < length) return { status: "output-too-small", length, visited, cost: this.gScore[goal] };
    cursor = goal;
    for (let index = length - 1; index >= 0; index -= 1) {
      output[index] = cursor;
      cursor = this.parents[cursor];
    }
    return { status: "found", length, visited, cost: this.gScore[goal] };
  }

  private heuristic(from: number, goal: number) {
    const dx = Math.abs(from % this.columns - goal % this.columns);
    const dy = Math.abs(Math.floor(from / this.columns) - Math.floor(goal / this.columns));
    return this.diagonal ? Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
  }

  private inBounds(column: number, row: number) {
    return column >= 0 && row >= 0 && column < this.columns && row < this.rows;
  }

  private assertIndex(index: number, label: string) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.size) throw new Error(`${label} index is outside the navigation grid.`);
  }
}

export function createGridNavigator(options: GridNavigatorOptions) {
  return new GridNavigator(options);
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

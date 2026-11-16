const SQRT2 = Math.SQRT2;
const NEIGHBOR_X = [-1, 1, 0, 0, -1, 1, -1, 1];
const NEIGHBOR_Y = [0, 0, -1, 1, -1, -1, 1, 1];

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

/** Reusable allocation-bounded A* workspace for rectangular grids. */
export function createGridNavigator(options: GridNavigatorOptions) {
  const columns = positiveInteger(options.columns, "columns");
  const rows = positiveInteger(options.rows, "rows");
  const size = columns * rows;
  if (!Number.isSafeInteger(size) || size > 16_777_216) throw new Error("Grid navigator supports at most 16,777,216 cells.");
  const maxVisited = positiveInteger(options.maxVisited ?? size, "maxVisited");
  const blocked = options.blocked ?? new Uint8Array(size);
  if (blocked.length !== size) throw new Error("Blocked grid length does not match its dimensions.");
  if (options.costs?.length !== undefined && options.costs.length !== size) throw new Error("Cost grid length does not match its dimensions.");
  for (const cost of options.costs ?? []) if (!Number.isFinite(cost) || cost < 1) throw new Error("Grid traversal costs must be finite numbers greater than or equal to 1.");
  const heapPositions = new Int32Array(size);
  heapPositions.fill(-1);
  const costs = options.costs;
  const diagonal = options.diagonal ?? false;
  const allowCornerCutting = options.allowCornerCutting ?? false;
  const generation = new Uint32Array(size);
  const closedGeneration = new Uint32Array(size);
  const gScore = new Float64Array(size);
  const parents = new Int32Array(size);
  const heapNodes = new Int32Array(size);
  const scores = new Float64Array(size);
  let queryGeneration = 0, heapLength = 0;
  return Object.freeze({
    columns,
    rows,
    size,
    diagonal,
    allowCornerCutting,
    maxVisited,
    blocked,
    ...(costs ? { costs } : {}),
    setBlocked(index: number, value: boolean) {
      assertGridIndex(index, "cell");
      blocked[index] = value ? 1 : 0;
    },
    findPath: (start: number, goal: number, output: Int32Array) => findGridPath(start, goal, output),
  });

  function findGridPath(start: number, goal: number, output: Int32Array): GridPathResult {
    assertGridIndex(start, "start");
    assertGridIndex(goal, "goal");
    if (!(output instanceof Int32Array)) throw new Error("Grid path output must be an Int32Array.");
    if (blocked[start] || blocked[goal]) return { status: "not-found", length: 0, visited: 0, cost: Infinity };
    if (start === goal) {
      if (!output.length) return { status: "output-too-small", length: 1, visited: 0, cost: 0 };
      output[0] = start;
      return { status: "found", length: 1, visited: 0, cost: 0 };
    }
    beginGridQuery();
    touchGridNode(start, 0, -1);
    pushOrDecreaseGridNode(start, gridHeuristic(start, goal));
    let visited = 0;
    while (heapLength) {
      const current = popGridNode();
      if (closedGeneration[current] === queryGeneration) continue;
      closedGeneration[current] = queryGeneration;
      visited += 1;
      if (visited > maxVisited) return { status: "budget-exceeded", length: 0, visited: visited - 1, cost: Infinity };
      if (current === goal) return writeGridPath(start, goal, output, visited);
      visitGridNeighbors(current, goal);
    }
    return { status: "not-found", length: 0, visited, cost: Infinity };
  }

  function beginGridQuery() {
    queryGeneration = (queryGeneration + 1) >>> 0;
    if (queryGeneration === 0) {
      generation.fill(0);
      closedGeneration.fill(0);
      queryGeneration = 1;
    }
    heapLength = 0;
  }

  function visitGridNeighbors(current: number, goal: number) {
    const column = current % columns, row = Math.floor(current / columns);
    // Keep the original cardinal/diagonal order: it is part of path tie behavior.
    for (let direction = 0; direction < (diagonal ? 8 : 4); direction++) {
      const dx = NEIGHBOR_X[direction]!;
      const dy = NEIGHBOR_Y[direction]!;
      const x = column + dx, y = row + dy;
      if (!inGridBounds(x, y)) continue;
      if (direction >= 4 && !allowCornerCutting && (blocked[row * columns + x] || blocked[y * columns + column])) continue;
      visitGridNeighbor(current, x, y, direction < 4 ? 1 : SQRT2, goal);
    }
  }

  function visitGridNeighbor(current: number, column: number, row: number, distance: number, goal: number) {
    if (!inGridBounds(column, row)) return;
    const next = row * columns + column;
    if (blocked[next] || closedGeneration[next] === queryGeneration) return;
    const nextCost = gScore[current] + distance * (costs?.[next] ?? 1);
    if (generation[next] === queryGeneration && nextCost >= gScore[next]) return;
    touchGridNode(next, nextCost, current);
    pushOrDecreaseGridNode(next, nextCost + gridHeuristic(next, goal));
  }

  function touchGridNode(index: number, score: number, parent: number) {
    if (generation[index] !== queryGeneration) heapPositions[index] = -1;
    generation[index] = queryGeneration;
    gScore[index] = score;
    parents[index] = parent;
  }

  function pushOrDecreaseGridNode(node: number, score: number) {
    let position = heapPositions[node];
    if (position < 0) {
      position = heapLength++;
      heapNodes[position] = node;
      heapPositions[node] = position;
    }
    scores[node] = score;
    siftGridNode(position, node, true);
  }

  function popGridNode() {
    const node = heapNodes[0];
    heapPositions[node] = -2;
    if (--heapLength) siftGridNode(0, heapNodes[heapLength], false);
    return node;
  }

  // Scores are owned by nodes, so both heap directions share relocation.
  function siftGridNode(position: number, node: number, up: boolean) {
    while (true) {
      let next = up ? (position - 1) >>> 1 : position * 2 + 1;
      if (up ? position === 0 : next >= heapLength) break;
      if (!up && next + 1 < heapLength && lessGridNode(heapNodes[next + 1], heapNodes[next])) next++;
      const other = heapNodes[next];
      if (up ? !lessGridNode(node, other) : !lessGridNode(other, node)) break;
      heapNodes[position] = other;
      heapPositions[other] = position;
      position = next;
    }
    heapNodes[position] = node;
    heapPositions[node] = position;
  }

  function lessGridNode(a: number, b: number) {
    const left = scores[a], right = scores[b];
    return left < right || (left === right && a < b);
  }

  function writeGridPath(start: number, goal: number, output: Int32Array, visited: number): GridPathResult {
    let length = 1;
    let cursor = goal;
    while (cursor !== start) {
      cursor = parents[cursor];
      if (cursor < 0 || length > size) throw new Error("Grid path parent chain is corrupt.");
      length += 1;
    }
    if (output.length < length) return { status: "output-too-small", length, visited, cost: gScore[goal] };
    cursor = goal;
    for (let index = length - 1; index >= 0; index -= 1) {
      output[index] = cursor;
      cursor = parents[cursor];
    }
    return { status: "found", length, visited, cost: gScore[goal] };
  }

  function gridHeuristic(from: number, goal: number) {
    const dx = Math.abs(from % columns - goal % columns);
    const dy = Math.abs(Math.floor(from / columns) - Math.floor(goal / columns));
    return diagonal ? Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
  }

  function inGridBounds(column: number, row: number) {
    return column >= 0 && row >= 0 && column < columns && row < rows;
  }

  function assertGridIndex(index: number, label: string) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= size) throw new Error(`${label} index is outside the navigation grid.`);
  }


}

export type GridNavigator = ReturnType<typeof createGridNavigator>;

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

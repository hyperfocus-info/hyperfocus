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

type GridNavigatorState = {
  columns: number;
  rows: number;
  size: number;
  diagonal: boolean;
  allowCornerCutting: boolean;
  maxVisited: number;
  blocked: Uint8Array;
  costs: Float32Array | undefined;
  generation: Uint32Array;
  closedGeneration: Uint32Array;
  gScore: Float64Array;
  parents: Int32Array;
  heapNodes: Int32Array;
  heapScores: Float64Array;
  heapPositions: Int32Array;
  queryGeneration: number;
  heapLength: number;
};

/** Reusable allocation-bounded A* workspace for rectangular grids. */
export function createGridNavigator(options: GridNavigatorOptions) {
  const state = createGridNavigatorState(options);
  return Object.freeze({
    columns: state.columns,
    rows: state.rows,
    size: state.size,
    diagonal: state.diagonal,
    allowCornerCutting: state.allowCornerCutting,
    maxVisited: state.maxVisited,
    blocked: state.blocked,
    ...(state.costs ? { costs: state.costs } : {}),
    setBlocked(index: number, blocked: boolean) {
      assertGridIndex(state, index, "cell");
      state.blocked[index] = blocked ? 1 : 0;
    },
    findPath: (start: number, goal: number, output: Int32Array) => findGridPath(state, start, goal, output),
  });
}

export type GridNavigator = ReturnType<typeof createGridNavigator>;

function createGridNavigatorState(options: GridNavigatorOptions): GridNavigatorState {
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
  return {
    columns, rows, size, maxVisited, blocked, costs: options.costs,
    diagonal: options.diagonal ?? false,
    allowCornerCutting: options.allowCornerCutting ?? false,
    generation: new Uint32Array(size),
    closedGeneration: new Uint32Array(size),
    gScore: new Float64Array(size),
    parents: new Int32Array(size),
    heapNodes: new Int32Array(size),
    heapScores: new Float64Array(size),
    heapPositions,
    queryGeneration: 0,
    heapLength: 0,
  };
}

function findGridPath(state: GridNavigatorState, start: number, goal: number, output: Int32Array): GridPathResult {
  assertGridIndex(state, start, "start");
  assertGridIndex(state, goal, "goal");
  if (!(output instanceof Int32Array)) throw new Error("Grid path output must be an Int32Array.");
  if (state.blocked[start] || state.blocked[goal]) return { status: "not-found", length: 0, visited: 0, cost: Infinity };
  if (start === goal) {
    if (!output.length) return { status: "output-too-small", length: 1, visited: 0, cost: 0 };
    output[0] = start;
    return { status: "found", length: 1, visited: 0, cost: 0 };
  }
  beginGridQuery(state);
  touchGridNode(state, start, 0, -1);
  pushOrDecreaseGridNode(state, start, gridHeuristic(state, start, goal));
  let visited = 0;
  while (state.heapLength) {
    const current = popGridNode(state);
    if (state.closedGeneration[current] === state.queryGeneration) continue;
    state.closedGeneration[current] = state.queryGeneration;
    visited += 1;
    if (visited > state.maxVisited) return { status: "budget-exceeded", length: 0, visited: visited - 1, cost: Infinity };
    if (current === goal) return writeGridPath(state, start, goal, output, visited);
    visitGridNeighbors(state, current, goal);
  }
  return { status: "not-found", length: 0, visited, cost: Infinity };
}

function beginGridQuery(state: GridNavigatorState) {
  state.queryGeneration = (state.queryGeneration + 1) >>> 0;
  if (state.queryGeneration === 0) {
    state.generation.fill(0);
    state.closedGeneration.fill(0);
    state.queryGeneration = 1;
  }
  state.heapLength = 0;
}

function visitGridNeighbors(state: GridNavigatorState, current: number, goal: number) {
  const column = current % state.columns;
  const row = Math.floor(current / state.columns);
  visitGridNeighbor(state, current, column - 1, row, 1, goal);
  visitGridNeighbor(state, current, column + 1, row, 1, goal);
  visitGridNeighbor(state, current, column, row - 1, 1, goal);
  visitGridNeighbor(state, current, column, row + 1, 1, goal);
  if (!state.diagonal) return;
  visitGridDiagonal(state, current, column, row, -1, -1, goal);
  visitGridDiagonal(state, current, column, row, 1, -1, goal);
  visitGridDiagonal(state, current, column, row, -1, 1, goal);
  visitGridDiagonal(state, current, column, row, 1, 1, goal);
}

function visitGridDiagonal(state: GridNavigatorState, current: number, column: number, row: number, dx: number, dy: number, goal: number) {
  const nextColumn = column + dx;
  const nextRow = row + dy;
  if (!inGridBounds(state, nextColumn, nextRow)) return;
  if (!state.allowCornerCutting) {
    const horizontal = row * state.columns + nextColumn;
    const vertical = nextRow * state.columns + column;
    if (state.blocked[horizontal] || state.blocked[vertical]) return;
  }
  visitGridNeighbor(state, current, nextColumn, nextRow, SQRT2, goal);
}

function visitGridNeighbor(state: GridNavigatorState, current: number, column: number, row: number, distance: number, goal: number) {
  if (!inGridBounds(state, column, row)) return;
  const next = row * state.columns + column;
  if (state.blocked[next] || state.closedGeneration[next] === state.queryGeneration) return;
  const nextCost = state.gScore[current] + distance * (state.costs?.[next] ?? 1);
  if (state.generation[next] === state.queryGeneration && nextCost >= state.gScore[next]) return;
  touchGridNode(state, next, nextCost, current);
  pushOrDecreaseGridNode(state, next, nextCost + gridHeuristic(state, next, goal));
}

function touchGridNode(state: GridNavigatorState, index: number, score: number, parent: number) {
  if (state.generation[index] !== state.queryGeneration) state.heapPositions[index] = -1;
  state.generation[index] = state.queryGeneration;
  state.gScore[index] = score;
  state.parents[index] = parent;
}

function pushOrDecreaseGridNode(state: GridNavigatorState, node: number, score: number) {
  let position = state.heapPositions[node];
  if (position < 0) {
    position = state.heapLength++;
    state.heapNodes[position] = node;
    state.heapPositions[node] = position;
  }
  state.heapScores[position] = score;
  bubbleUpGridNode(state, position);
}

function popGridNode(state: GridNavigatorState) {
  const node = state.heapNodes[0];
  state.heapPositions[node] = -2;
  state.heapLength -= 1;
  if (state.heapLength) {
    const tail = state.heapNodes[state.heapLength];
    state.heapNodes[0] = tail;
    state.heapScores[0] = state.heapScores[state.heapLength];
    state.heapPositions[tail] = 0;
    bubbleDownGridNode(state, 0);
  }
  return node;
}

function bubbleUpGridNode(state: GridNavigatorState, start: number) {
  let position = start;
  while (position > 0) {
    const parent = (position - 1) >>> 1;
    if (!lessGridNode(state, position, parent)) break;
    swapGridNodes(state, position, parent);
    position = parent;
  }
}

function bubbleDownGridNode(state: GridNavigatorState, start: number) {
  let position = start;
  while (true) {
    const left = position * 2 + 1;
    if (left >= state.heapLength) return;
    const right = left + 1;
    const smallest = right < state.heapLength && lessGridNode(state, right, left) ? right : left;
    if (!lessGridNode(state, smallest, position)) return;
    swapGridNodes(state, smallest, position);
    position = smallest;
  }
}

function lessGridNode(state: GridNavigatorState, a: number, b: number) {
  return state.heapScores[a] < state.heapScores[b]
    || (state.heapScores[a] === state.heapScores[b] && state.heapNodes[a] < state.heapNodes[b]);
}

function swapGridNodes(state: GridNavigatorState, a: number, b: number) {
  const node = state.heapNodes[a];
  const score = state.heapScores[a];
  state.heapNodes[a] = state.heapNodes[b];
  state.heapScores[a] = state.heapScores[b];
  state.heapNodes[b] = node;
  state.heapScores[b] = score;
  state.heapPositions[state.heapNodes[a]] = a;
  state.heapPositions[state.heapNodes[b]] = b;
}

function writeGridPath(state: GridNavigatorState, start: number, goal: number, output: Int32Array, visited: number): GridPathResult {
  let length = 1;
  let cursor = goal;
  while (cursor !== start) {
    cursor = state.parents[cursor];
    if (cursor < 0 || length > state.size) throw new Error("Grid path parent chain is corrupt.");
    length += 1;
  }
  if (output.length < length) return { status: "output-too-small", length, visited, cost: state.gScore[goal] };
  cursor = goal;
  for (let index = length - 1; index >= 0; index -= 1) {
    output[index] = cursor;
    cursor = state.parents[cursor];
  }
  return { status: "found", length, visited, cost: state.gScore[goal] };
}

function gridHeuristic(state: GridNavigatorState, from: number, goal: number) {
  const dx = Math.abs(from % state.columns - goal % state.columns);
  const dy = Math.abs(Math.floor(from / state.columns) - Math.floor(goal / state.columns));
  return state.diagonal ? Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy) : dx + dy;
}

function inGridBounds(state: GridNavigatorState, column: number, row: number) {
  return column >= 0 && row >= 0 && column < state.columns && row < state.rows;
}

function assertGridIndex(state: GridNavigatorState, index: number, label: string) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= state.size) throw new Error(`${label} index is outside the navigation grid.`);
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

import { createGridNavigator, type GridNavigator } from "../navigation/grid.ts";
import { definePlayableBehavior2D } from "./runtime-2d-support.ts";
import type {
  PlayableBehavior2D,
  PlayableBehaviorRegistry2D,
  PlayableComponent2D,
  PlayableEntity2D,
  PlayableProject2D,
} from "./runtime-2d-contracts.ts";

const NAVIGATION_BEHAVIOR_KEY = "builtin:navigate#update";

export type NavigationRuntime2DOptions = {
  maxAgents?: number;
  maxGridCells?: number;
  maxVisited?: number;
  maxPathCells?: number;
};

export type NavigationDiagnostic2D = {
  severity: "error";
  code: "invalid-navigation" | "navigation-unreachable" | "navigation-budget-exceeded" | "navigation-path-too-long";
  sceneId: string;
  entityId: string;
  componentId: string;
  message: string;
};

type ResolvedOptions = Required<NavigationRuntime2DOptions>;
type AgentConfig = {
  targetX: number;
  targetY: number;
  speed: number;
  stopDistance: number;
  diagonal: boolean;
  allowCornerCutting: boolean;
  action?: string;
};
type AgentState = { path: Int32Array; cursor: number; goal: number };

/** Validates authored navigation agents and proves their initial static-grid routes. */
export function auditNavigationProject2D(project: PlayableProject2D, options: NavigationRuntime2DOptions = {}): NavigationDiagnostic2D[] {
  const resolved = resolveOptions(project, options);
  const diagnostics: NavigationDiagnostic2D[] = [];
  const navigators = createNavigators(project, resolved);
  const pathScratch = new Int32Array(resolved.maxPathCells);
  let agents = 0;
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of navigationComponents(entity)) {
        agents += 1;
        const location = { sceneId: scene.id, entityId: entity.id, componentId: component.id };
        if (agents > resolved.maxAgents) {
          diagnostics.push({ severity: "error", code: "invalid-navigation", message: `Navigation agent count exceeds the limit of ${resolved.maxAgents}.`, ...location });
          continue;
        }
        let config: AgentConfig;
        try { config = navigationConfig(component, project); }
        catch (cause) {
          diagnostics.push({ severity: "error", code: "invalid-navigation", message: cause instanceof Error ? cause.message : String(cause), ...location });
          continue;
        }
        const navigator = navigators.get(configKey(config))!;
        const start = worldCell(entity.x, entity.y, project);
        const goal = worldCell(config.targetX, config.targetY, project);
        if (start === undefined || goal === undefined) {
          diagnostics.push({ severity: "error", code: "invalid-navigation", message: `Navigation agent ${entity.id} starts or targets outside the tilemap.`, ...location });
          continue;
        }
        const result = navigator.findPath(start, goal, pathScratch);
        if (result.status === "not-found") diagnostics.push({ severity: "error", code: "navigation-unreachable", message: `Navigation target for ${entity.id} is unreachable on the static tile grid.`, ...location });
        else if (result.status === "budget-exceeded") diagnostics.push({ severity: "error", code: "navigation-budget-exceeded", message: `Navigation route for ${entity.id} exceeds the ${resolved.maxVisited}-cell search budget.`, ...location });
        else if (result.status === "output-too-small") diagnostics.push({ severity: "error", code: "navigation-path-too-long", message: `Navigation route for ${entity.id} needs ${result.length} cells; the path limit is ${resolved.maxPathCells}.`, ...location });
      }
    }
  }
  return diagnostics;
}

/**
 * Compiles `builtin:navigate` into a statically registered portable behavior.
 * All A* workspaces and per-agent paths are bounded before the registry is returned.
 * The returned registry owns mutable path cursors and must belong to exactly one
 * PlayableWorld. Call this factory once per world, including deterministic replays.
 */
export function createNavigationBehaviorRegistry2D(project: PlayableProject2D, options: NavigationRuntime2DOptions = {}): PlayableBehaviorRegistry2D {
  const resolved = resolveOptions(project, options);
  const diagnostics = auditNavigationProject2D(project, resolved);
  if (diagnostics.length) throw new Error(`Portable navigation preflight failed:\n${diagnostics.map((item) => `- ${item.message}`).join("\n")}`);
  const navigators = createNavigators(project, resolved);
  const states = new Map<string, AgentState>();
  const pathScratch = new Int32Array(resolved.maxPathCells);
  const behavior: PlayableBehavior2D = definePlayableBehavior2D({
    version: 1,
    id: "navigate",
    module: "builtin:navigate",
    exportName: "update",
    label: "Navigate tilemap",
    description: "Follows a bounded A* path toward an authored world position.",
    category: "Navigation",
    builtIn: true,
    fields: [
      { key: "targetX", label: "Target X", type: "number", default: 0, unit: "px", group: "Target" },
      { key: "targetY", label: "Target Y", type: "number", default: 0, unit: "px", group: "Target" },
      { key: "speed", label: "Speed", type: "number", default: 120, minimum: 0.000_001, maximum: 10_000, unit: "px/s", group: "Movement" },
      { key: "stopDistance", label: "Stop distance", type: "number", default: 0.5, minimum: 0, unit: "px", group: "Movement" },
      { key: "diagonal", label: "Allow diagonal paths", type: "boolean", default: false, group: "Path" },
      { key: "allowCornerCutting", label: "Allow corner cutting", type: "boolean", default: false, group: "Path", advanced: true },
      { key: "action", label: "Activation action", type: "action", default: "", group: "Input", advanced: true, optional: true },
    ],
  }, (context) => {
    const config = navigationConfig(context.component, project);
    if (config.action && !context.actions.includes(config.action)) return;
    const current = worldCell(context.entity.x, context.entity.y, project);
    const goal = worldCell(config.targetX, config.targetY, project);
    if (current === undefined || goal === undefined) return;
    const key = `${context.entity.id}\0${context.component.id}`;
    let state = states.get(key);
    if (!state || state.goal !== goal || !pathContainsCurrent(state, current)) {
      const result = navigators.get(configKey(config))!.findPath(current, goal, pathScratch);
      if (result.status !== "found") return;
      state = { path: pathScratch.slice(0, result.length), cursor: result.length > 1 ? 1 : 0, goal };
      states.set(key, state);
    }
    while (state.cursor < state.path.length) {
      const final = state.cursor === state.path.length - 1;
      const waypoint = final ? { x: config.targetX, y: config.targetY } : cellCenter(state.path[state.cursor]!, project);
      const dx = waypoint.x - context.entity.x;
      const dy = waypoint.y - context.entity.y;
      const distance = Math.hypot(dx, dy);
      if (final && distance <= config.stopDistance) return;
      if (distance <= 1e-9) { state.cursor += 1; continue; }
      const velocity = Math.min(config.speed, distance / context.deltaSeconds);
      // The capped velocity lands exactly on a waypoint instead of oscillating around it.
      return { velocityX: dx / distance * velocity, velocityY: dy / distance * velocity };
    }
    return;
  });
  return Object.freeze({ [NAVIGATION_BEHAVIOR_KEY]: behavior });
}

export function navigationBehaviorKey2D() { return NAVIGATION_BEHAVIOR_KEY; }

function resolveOptions(project: PlayableProject2D, options: NavigationRuntime2DOptions): ResolvedOptions {
  const cells = project.tilemap.columns * project.tilemap.rows;
  const resolved = {
    maxAgents: positiveInteger(options.maxAgents ?? 512, "maxAgents"),
    maxGridCells: positiveInteger(options.maxGridCells ?? 262_144, "maxGridCells"),
    maxVisited: positiveInteger(options.maxVisited ?? Math.min(cells, 100_000), "maxVisited"),
    maxPathCells: positiveInteger(options.maxPathCells ?? Math.min(cells, 4_096), "maxPathCells"),
  };
  if (!Number.isSafeInteger(cells) || cells <= 0 || cells > resolved.maxGridCells) throw new Error(`Portable navigation grid has ${cells} cells; the limit is ${resolved.maxGridCells}.`);
  if (resolved.maxVisited > cells) throw new Error("maxVisited cannot exceed the navigation grid cell count.");
  if (resolved.maxPathCells > cells) throw new Error("maxPathCells cannot exceed the navigation grid cell count.");
  return resolved;
}

function createNavigators(project: PlayableProject2D, options: ResolvedOptions): Map<string, GridNavigator> {
  const blocked = new Uint8Array(project.tilemap.values.length);
  const solid = project.tilemap.solidValues ? new Set(project.tilemap.solidValues) : undefined;
  for (let index = 0; index < blocked.length; index += 1) blocked[index] = solid ? Number(solid.has(project.tilemap.values[index]!)) : Number(project.tilemap.values[index] !== 0);
  const configs = new Set<string>();
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of navigationComponents(entity)) {
    const diagonal = component.values.diagonal === true;
    const corner = component.values.allowCornerCutting === true;
    configs.add(`${Number(diagonal)}:${Number(corner)}`);
  }
  const result = new Map<string, GridNavigator>();
  for (const key of configs) {
    const [diagonal, corner] = key.split(":").map(Number);
    result.set(key, createGridNavigator({
      columns: project.tilemap.columns,
      rows: project.tilemap.rows,
      blocked: new Uint8Array(blocked),
      diagonal: Boolean(diagonal),
      allowCornerCutting: Boolean(corner),
      maxVisited: options.maxVisited,
    }));
  }
  return result;
}

function navigationComponents(entity: PlayableEntity2D) {
  return entity.components.filter((component) => component.enabled && component.type === "behavior" && component.values.module === "builtin:navigate");
}

function navigationConfig(component: PlayableComponent2D, project: PlayableProject2D): AgentConfig {
  const targetX = finiteNumber(component.values.targetX, `Navigation component ${component.id} targetX`);
  const targetY = finiteNumber(component.values.targetY, `Navigation component ${component.id} targetY`);
  const width = project.tilemap.columns * project.tilemap.tileSize;
  const height = project.tilemap.rows * project.tilemap.tileSize;
  if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) throw new Error(`Navigation component ${component.id} target is outside the tilemap.`);
  const speed = finiteNumber(component.values.speed ?? 120, `Navigation component ${component.id} speed`);
  if (speed <= 0 || speed > 10_000) throw new Error(`Navigation component ${component.id} speed must be greater than 0 and at most 10000.`);
  const stopDistance = finiteNumber(component.values.stopDistance ?? 0.5, `Navigation component ${component.id} stopDistance`);
  if (stopDistance < 0 || stopDistance > project.tilemap.tileSize) throw new Error(`Navigation component ${component.id} stopDistance must be between 0 and one tile.`);
  for (const key of ["diagonal", "allowCornerCutting"] as const) {
    if (component.values[key] !== undefined && typeof component.values[key] !== "boolean") throw new Error(`Navigation component ${component.id} ${key} must be boolean.`);
  }
  const action = component.values.action;
  if (action !== undefined && (typeof action !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(action))) throw new Error(`Navigation component ${component.id} action is invalid.`);
  if (typeof action === "string" && !project.settings.input.some((mapping) => mapping.action === action)) throw new Error(`Navigation component ${component.id} references unmapped project action ${action}.`);
  return { targetX, targetY, speed, stopDistance, diagonal: component.values.diagonal === true, allowCornerCutting: component.values.allowCornerCutting === true, ...(typeof action === "string" ? { action } : {}) };
}

function configKey(config: Pick<AgentConfig, "diagonal" | "allowCornerCutting">) {
  return `${Number(config.diagonal)}:${Number(config.allowCornerCutting)}`;
}

function worldCell(x: number, y: number, project: PlayableProject2D): number | undefined {
  const column = Math.floor(x / project.tilemap.tileSize);
  const row = Math.floor(y / project.tilemap.tileSize);
  if (column < 0 || row < 0 || column >= project.tilemap.columns || row >= project.tilemap.rows) return undefined;
  return row * project.tilemap.columns + column;
}

function cellCenter(index: number, project: PlayableProject2D) {
  const column = index % project.tilemap.columns;
  const row = Math.floor(index / project.tilemap.columns);
  return { x: (column + 0.5) * project.tilemap.tileSize, y: (row + 0.5) * project.tilemap.tileSize };
}

function pathContainsCurrent(state: AgentState, current: number) {
  const start = Math.max(0, state.cursor - 1);
  const end = Math.min(state.path.length, state.cursor + 1);
  for (let index = start; index < end; index += 1) if (state.path[index] === current) return true;
  return false;
}

function finiteNumber(value: string | number | boolean | undefined, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

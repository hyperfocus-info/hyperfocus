import type { StageEntity } from '@hyperfocus/engine';
import type { EditorComponent, EditorProject } from '@hyperfocus/engine/project';
export type WorkspaceId = "stage" | "scene3d" | "tilemap" | "atlas" | "script" | "post" | "motion" | "diagnostics";
export type BrushMode = "paint" | "erase" | "inspect" | "fill" | "marquee";
export type TileId = number;

export type EditorEntity = StageEntity & {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation?: number;
  opacity?: number;
  color: string;
  accent: string;
  kind: string;
  parentId?: string;
  components?: EditorComponent[];
};

export type EffectId = "grayscale" | "sepia" | "crt" | "shake" | "threshold";
export type EffectConfig = {
  id: EffectId;
  label: string;
  tier: string;
  enabled: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
};

export type EditorAutomation = {
  ready: boolean;
  activeWorkspace: WorkspaceId;
  selectedEntityId: string | null;
  postBudgetOk: boolean;
  footSlipMeters: number;
  wasmLatencyMs: number;
  typescriptLatencyMs: number;
  loopPaused: boolean;
  tileTool: BrushMode;
  extractedCollisionCount: number;
  atlasFrameCount: number;
  injectedLatencyMs: number;
  commandPaletteOpen: boolean;
  manualSteps: number;
  frameCount: number;
  keyboardActions: Record<string, boolean>;
  wasmFallbackActive: boolean;
  wasmFallbackReason: string;
  canvasResizeCommits: number;
  selectedEntityIds: string[];
  showWorkspace(id: WorkspaceId): void;
  injectHeavyPostStack(): void;
  appendHeavyPostPasses(count: number): void;
  simulateWasmFallback(): Promise<void>;
  calibrateWorldZero(x: number, y: number): void;
  keyboardHeld(action: string): boolean;
  assetPreviewReady(id: string): boolean;
  entityPosition(id: string): { x: number; y: number } | undefined;
  scene3dObjectPosition(id: string): { x: number; y: number; z: number } | undefined;
  selectEntity(id: string): void;
  setProceduralWalk(active: boolean): void;
  stepMotion(frames?: number): void;
  runBenchmark(): Promise<{ wasmMs: number; typescriptMs: number }>;
  openProductionLab(tab?: "export" | "reactive" | "logic" | "rig" | "review"): void;
  simulateMidi(value?: number): void;
  setSequenceFrame(frame: number): void;
  exportSequencePreview(): Promise<{ bytes: number; type: string }>;
};

declare global {
  /** @deprecated Compatibility alias for pre-rename automation consumers. */
  var __engineStudio: EditorAutomation | undefined;
  var __engineEditor: EditorAutomation | undefined;
}


export function authoredEntityKind(kind: string): "prop" | "actor" | "hostile" {
  return kind === "actor" || kind === "hostile" ? kind : "prop";
}

export function resolvePlayableActions(project: EditorProject, bindings: ReadonlySet<string>) {
  const actions = new Set<string>();
  for (const mapping of project.settings.input) if (mapping.bindings.some((binding) => bindings.has(binding))) actions.add(mapping.action);
  return actions;
}

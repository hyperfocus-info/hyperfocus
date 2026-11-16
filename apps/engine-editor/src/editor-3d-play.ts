import {
  createHyperfocus3DRuntime,
  type Hyperfocus3DDiagnostic,
  type Hyperfocus3DSnapshot,
  type PortableAsset3D,
} from "@hyperfocus/engine/project/runtime-3d";
import {
  createWebGl2Renderer3D,
  type WebGl2Diagnostic3D,
  type WebGl2FrameStats3D,
} from "@hyperfocus/engine/render/3d-webgl2";

type Editor3DInputProject = {
  settings: { input: ReadonlyArray<{ action: string; bindings: readonly string[] }> };
};

export type Editor3DPlayDiagnostic = Hyperfocus3DDiagnostic | WebGl2Diagnostic3D;

export type Editor3DPlaySession = {
  readonly diagnostics: readonly Editor3DPlayDiagnostic[];
  advance(deltaSeconds: number, heldBindings: ReadonlySet<string>, gamepadAxes?: ArrayLike<number>): Hyperfocus3DSnapshot;
  render(): WebGl2FrameStats3D;
  snapshot(): Hyperfocus3DSnapshot;
  dispose(): void;
};

export type CreateEditor3DPlaySessionOptions = {
  project: Editor3DInputProject & { extensions?: Record<string, unknown> };
  assets: readonly PortableAsset3D[];
  canvas: HTMLCanvasElement;
  signal?: AbortSignal;
  onDiagnostic?: (diagnostic: Editor3DPlayDiagnostic) => void;
};

/**
 * Browser-only lifecycle adapter around the same DOM-free 3D runtime and
 * first-party WebGL2 renderer used by standalone builds. Runtime snapshots are
 * intentionally session-local; authored project data is never written back.
 */
export async function createEditor3DPlaySession(options: CreateEditor3DPlaySessionOptions): Promise<Editor3DPlaySession> {
  throwIfAborted(options.signal);
  const project = structuredClone(options.project);
  const assets = options.assets.map((asset) => ({ ...asset, bytes: new Uint8Array(asset.bytes) }));
  const runtime = await createHyperfocus3DRuntime(project, assets);
  throwIfAborted(options.signal);

  const diagnostics: Editor3DPlayDiagnostic[] = [...runtime.diagnostics];
  const report = (diagnostic: Editor3DPlayDiagnostic) => {
    diagnostics.push(diagnostic);
    options.onDiagnostic?.(diagnostic);
  };
  const renderer = createWebGl2Renderer3D({
    canvas: options.canvas,
    scene: runtime.scene,
    maxInstances: runtime.declaration.budgets.entities,
    clearColor: [0.025, 0.045, 0.075, 1],
    maxDrawingBufferWidth: 3_840,
    maxDrawingBufferHeight: 2_160,
    maxDevicePixelRatio: 2,
    onDiagnostic: report,
  });
  if (options.signal?.aborted) {
    renderer.dispose();
    throw aborted();
  }

  let accumulator = 0;
  let disposed = false;
  const assertActive = () => {
    if (disposed) throw new Error("The 3D editor Play session has been disposed.");
  };

  return {
    diagnostics,
    advance(deltaSeconds, heldBindings, gamepadAxes) {
      assertActive();
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError(`3D editor deltaSeconds must be finite and non-negative; received ${deltaSeconds}.`);
      accumulator = Math.min(0.25, accumulator + deltaSeconds);
      const actions = resolveEditor3DActions(project, heldBindings, gamepadAxes);
      while (accumulator >= 0.016666666666666666) {
        runtime.step(actions);
        accumulator -= 0.016666666666666666;
      }
      return runtime.snapshot();
    },
    render() {
      assertActive();
      const width = Math.max(1, options.canvas.clientWidth || options.canvas.width);
      const height = Math.max(1, options.canvas.clientHeight || options.canvas.height);
      return renderer.render(runtime.compile(), runtime.viewProjection(width / height), {
        cameraPosition: runtime.cameraPosition(),
      });
    },
    snapshot: () => runtime.snapshot(),
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.dispose();
    },
  };
}

export function resolveEditor3DActions(
  project: Editor3DInputProject,
  heldBindings: ReadonlySet<string>,
  gamepadAxes?: ArrayLike<number>,
): Set<string> {
  const actions = new Set<string>();
  for (const mapping of project.settings.input) {
    if (mapping.bindings.some((binding) => heldBindings.has(binding))) actions.add(mapping.action);
  }
  const horizontal = Number(gamepadAxes?.[0] ?? 0);
  const vertical = Number(gamepadAxes?.[1] ?? 0);
  if (horizontal < -0.3) actions.add("move-left");
  if (horizontal > 0.3) actions.add("move-right");
  if (vertical < -0.3) actions.add("move-up");
  if (vertical > 0.3) actions.add("move-down");
  return actions;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw aborted();
}

function aborted() {
  const error = new Error("3D editor Play startup was cancelled.");
  error.name = "AbortError";
  return error;
}

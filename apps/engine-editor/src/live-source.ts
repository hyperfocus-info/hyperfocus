import type { PlayableBehavior2D, PlayableBehaviorRegistry2D } from "@hyperfocus/engine/project/runtime-2d";
import type { EditorProject } from "@hyperfocus/engine/project";
import type { EditorBehaviorBinding, EditorSourceCompileRequest, EditorSourceFile } from "../source-compiler-api.ts";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Compiles the same project-owned source used by live preview into a classic
 * script registry that can run before the offline standalone runtime. */
export async function compileStandaloneProjectSource(
  project: EditorProject,
  fetcher: FetchLike = (input, init) => fetch(input, init),
): Promise<string | undefined> {
  const request = createLiveSourceRequest(project);
  if (!request.behaviors.length) return undefined;
  const response = await fetcher("/api/source/v1/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, target: "standalone" }),
  });
  const payload = await responseRecord(response);
  if (!response.ok || typeof payload.code !== "string") {
    throw new Error(typeof payload.error === "string" ? payload.error : `Standalone source compiler returned HTTP ${response.status}.`);
  }
  return payload.code;
}

export function createLiveSourceCompiler(fetcher: FetchLike = (input, init) => fetch(input, init)) {
  let cachedRequest = "";
  let cachedRegistry: PlayableBehaviorRegistry2D = Object.freeze({});
  let generation = 0;

  return {
    async compile(project: EditorProject) {
      const compileGeneration = generation;
      const request = createLiveSourceRequest(project);
      const serialized = JSON.stringify(request);
      if (serialized === cachedRequest) return cachedRegistry;
      if (!request.behaviors.length) {
        const registry = Object.freeze({});
        if (compileGeneration === generation) {
          cachedRequest = serialized;
          cachedRegistry = registry;
        }
        return registry;
      }
      const response = await fetcher("/api/source/v1/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: serialized,
      });
      const payload = await responseRecord(response);
      if (!response.ok || typeof payload.code !== "string") throw new Error(typeof payload.error === "string" ? payload.error : `Live source compiler returned HTTP ${response.status}.`);
      const url = URL.createObjectURL(new Blob([payload.code], { type: "text/javascript" }));
      try {
        const loaded: unknown = await import(url);
        const registry = validateRegistry(isRecord(loaded) ? loaded.default : undefined, request.behaviors);
        if (compileGeneration === generation) {
          cachedRequest = serialized;
          cachedRegistry = registry;
        }
        return registry;
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    clear() {
      generation += 1;
      cachedRequest = "";
      cachedRegistry = Object.freeze({});
    },
  };
}

export type LiveSourceCompiler = ReturnType<typeof createLiveSourceCompiler>;

export function createLiveSourceRequest(project: EditorProject): EditorSourceCompileRequest {
  const files = readSourceFiles(project);
  const bindings = new Map<string, EditorBehaviorBinding>();
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (!component.enabled || component.type !== "behavior") continue;
        const module = component.values.module;
        const exportName = component.values.export ?? "update";
        if (typeof module !== "string" || module.startsWith("builtin:")) continue;
        if (typeof exportName !== "string") throw new Error(`Behavior ${component.id} has an invalid export name.`);
        if (!module.startsWith("./")) throw new Error(`Behavior ${component.id} module ${module} must be relative to the project root.`);
        bindings.set(`${module}#${exportName}`, { module, exportName });
      }
    }
  }
  return { version: 1, files, behaviors: [...bindings.values()] };
}

export function hasCustomProjectBehaviors(project: EditorProject): boolean {
  return project.scenes.some((scene) => scene.entities.some((entity) => entity.components.some((component) => component.enabled
    && component.type === "behavior"
    && typeof component.values.module === "string"
    && !component.values.module.startsWith("builtin:"))));
}

function readSourceFiles(project: EditorProject): EditorSourceFile[] {
  const value = project.extensions?.hyperfocusScripts;
  if (!isRecord(value) || !Array.isArray(value.files)) return [];
  return value.files.flatMap((file) => isRecord(file) && typeof file.path === "string" && typeof file.source === "string"
    ? [{ path: file.path, source: file.source }]
    : []);
}

function validateRegistry(value: unknown, behaviors: readonly EditorBehaviorBinding[]): PlayableBehaviorRegistry2D {
  if (!isRecord(value)) throw new Error("Live source compiler did not export a behavior registry.");
  const registry: Record<string, PlayableBehavior2D> = {};
  for (const behavior of behaviors) {
    const key = `${behavior.module}#${behavior.exportName}`;
    const implementation = value[key];
    if (typeof implementation !== "function") throw new Error(`Live source export ${key} is not a function.`);
    registry[key] = (context) => Reflect.apply(implementation, undefined, [context]);
  }
  return Object.freeze(registry);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function responseRecord(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}));
  return isRecord(value) ? Object.fromEntries(Object.entries(value)) : {};
}

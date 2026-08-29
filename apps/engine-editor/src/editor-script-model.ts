import { uniqueId, type EditorComponent, type EditorProject } from "@hyperfocus/engine/project";
import { createPlayableBehaviorComponentValues2D, type PlayableBehaviorDefinition2D } from "@hyperfocus/engine/project/runtime-2d";

export type EditorScriptFile = { path: string; language: "typescript" | "javascript"; source: string };
export type EditorScripts = { activePath: string; files: EditorScriptFile[] };
export type EditorBehaviorReference = { sceneId: string; entityId: string; entityLabel: string; componentId: string; exportName: string };

export function readEditorScripts(project: EditorProject): EditorScripts {
  const candidate = project.extensions?.hyperfocusScripts;
  if (!isRecord(candidate) || !Array.isArray(candidate.files)) return { activePath: "", files: [] };
  const files = candidate.files.flatMap((file) => isRecord(file) && typeof file.path === "string" && typeof file.source === "string"
    ? [{ path: normalizeScriptPath(file.path), language: file.language === "javascript" ? "javascript" as const : "typescript" as const, source: file.source }]
    : []);
  return { activePath: typeof candidate.activePath === "string" ? candidate.activePath : files[0]?.path ?? "", files };
}

export function createEditorScript(project: EditorProject, requestedPath: string, source?: string): string {
  const scripts = writableScripts(project);
  const path = normalizeScriptPath(requestedPath);
  if (scripts.files.some((file) => file.path === path)) throw new Error(`Script already exists: ${path}`);
  const definition = source === undefined ? defaultBehaviorDefinition(path) : undefined;
  scripts.files.push({ path, language: /\.jsx?$/i.test(path) ? "javascript" : "typescript", source: source ?? defaultBehaviorSource(definition!) });
  scripts.files.sort((a, b) => a.path.localeCompare(b.path));
  scripts.activePath = path;
  if (definition) upsertEditorBehaviorDefinition(project, definition);
  return path;
}

export function renameEditorScript(project: EditorProject, currentPath: string, requestedPath: string): string {
  const scripts = writableScripts(project);
  const from = normalizeScriptPath(currentPath);
  const to = normalizeScriptPath(requestedPath);
  const file = scripts.files.find((candidate) => candidate.path === from);
  if (!file) throw new Error(`Script does not exist: ${from}`);
  if (scripts.files.some((candidate) => candidate.path === to)) throw new Error(`Script already exists: ${to}`);
  file.path = to;
  file.language = /\.jsx?$/i.test(to) ? "javascript" : "typescript";
  if (scripts.activePath === from) scripts.activePath = to;
  const fromModule = `./${from}`;
  const toModule = `./${to}`;
  forEachBehavior(project, (component) => { if (component.values.module === fromModule) component.values.module = toModule; });
  const definitions = readEditorBehaviorDefinitions(project);
  for (const definition of definitions) if (definition.module === fromModule) definition.module = toModule;
  writeDefinitions(project, definitions);
  file.source = replaceDefinitionModuleLiteral(file.source, fromModule, toModule);
  scripts.files.sort((a, b) => a.path.localeCompare(b.path));
  return to;
}

export function removeEditorScript(project: EditorProject, requestedPath: string, options: { detachBehaviors?: boolean } = {}): void {
  const scripts = writableScripts(project);
  const path = normalizeScriptPath(requestedPath);
  const references = findEditorScriptReferences(project, path);
  if (references.length && !options.detachBehaviors) throw new Error(`${path} is attached to ${references.length} behavior${references.length === 1 ? "" : "s"}. Detach it before deleting.`);
  if (options.detachBehaviors) {
    const module = `./${path}`;
    for (const scene of project.scenes) for (const entity of scene.entities) {
      entity.components = entity.components.filter((component) => component.type !== "behavior" || component.values.module !== module);
    }
  }
  const before = scripts.files.length;
  scripts.files = scripts.files.filter((file) => file.path !== path);
  if (scripts.files.length === before) throw new Error(`Script does not exist: ${path}`);
  if (scripts.activePath === path) scripts.activePath = scripts.files[0]?.path ?? "";
  writeDefinitions(project, readEditorBehaviorDefinitions(project).filter((definition) => definition.module !== `./${path}`));
}

export function findEditorScriptReferences(project: EditorProject, requestedPath: string): EditorBehaviorReference[] {
  const module = `./${normalizeScriptPath(requestedPath)}`;
  const references: EditorBehaviorReference[] = [];
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) {
    if (component.type === "behavior" && component.values.module === module) references.push({
      sceneId: scene.id,
      entityId: entity.id,
      entityLabel: entity.label,
      componentId: component.id,
      exportName: typeof component.values.export === "string" ? component.values.export : "update",
    });
  }
  return references;
}

export function attachEditorScriptBehavior(project: EditorProject, entityId: string, requestedPath: string, exportName = "update"): string {
  const path = normalizeScriptPath(requestedPath);
  if (!readEditorScripts(project).files.some((file) => file.path === path)) throw new Error(`Script does not exist: ${path}`);
  if (!/^[A-Za-z_$][\w$]*$/.test(exportName)) throw new Error("Behavior export must be a valid JavaScript identifier.");
  const entity = project.scenes.flatMap((scene) => scene.entities).find((candidate) => candidate.id === entityId);
  if (!entity) throw new Error(`Entity does not exist: ${entityId}`);
  const id = uniqueId("behavior");
  const module = `./${path}`;
  const definition = readEditorBehaviorDefinitions(project).find((candidate) => candidate.module === module && candidate.exportName === exportName);
  const values = definition ? createPlayableBehaviorComponentValues2D(definition) : { module, export: exportName };
  entity.components.push({ id, type: "behavior", enabled: true, values });
  return id;
}

export function readEditorBehaviorDefinitions(project: EditorProject): PlayableBehaviorDefinition2D[] {
  const candidate = project.extensions?.hyperfocusBehaviorDefinitions;
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((definition) => validDefinition(definition) ? [structuredClone(definition)] : []);
}

export function upsertEditorBehaviorDefinition(project: EditorProject, definition: PlayableBehaviorDefinition2D): void {
  if (!validDefinition(definition)) throw new Error("Project behavior definition is invalid.");
  const current = readEditorBehaviorDefinitions(project).filter((candidate) => candidate.module !== definition.module || candidate.exportName !== definition.exportName);
  writeDefinitions(project, [...current, structuredClone(definition)]);
}

export function normalizeScriptPath(value: string): string {
  const path = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!path || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Script path must stay inside the project: ${value}`);
  if (!/\.(?:[cm]?[jt]sx?)$/i.test(path)) throw new Error("Script path must end in .ts, .tsx, .js, .jsx, .mts, or .cts.");
  if (path.split("/").some((part) => !/^[A-Za-z0-9._-]+$/.test(part))) throw new Error(`Script path contains unsupported characters: ${value}`);
  return path;
}

function writableScripts(project: EditorProject): EditorScripts {
  project.extensions ??= {};
  const scripts = readEditorScripts(project);
  project.extensions.hyperfocusScripts = scripts;
  return scripts;
}

function forEachBehavior(project: EditorProject, visit: (component: EditorComponent) => void) {
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) if (component.type === "behavior") visit(component);
}

function defaultBehaviorDefinition(path: string): PlayableBehaviorDefinition2D {
  const normalized = normalizeScriptPath(path);
  const stem = normalized.split("/").at(-1)!.replace(/\.[^.]+$/, "");
  return {
    version: 1,
    id: `${stem.replace(/[^A-Za-z0-9_-]+/g, "-") || "behavior"}-behavior`,
    module: `./${normalized}`,
    exportName: "update",
    label: humanLabel(stem),
    description: "Moves while the move-right action is active.",
    category: "Movement",
    fields: [{ key: "speed", label: "Speed", type: "number", default: 180, minimum: 0, maximum: 2_000, unit: "px/s" }],
  };
}

function defaultBehaviorSource(definition: PlayableBehaviorDefinition2D) {
  return `import type { PlayableBehavior2D, PlayableBehaviorDefinition2D } from "@hyperfocus/engine/project/runtime-2d";\n\nexport const updateDefinition = ${JSON.stringify(definition, null, 2)} satisfies PlayableBehaviorDefinition2D;\n\nexport const update: PlayableBehavior2D = ({ actions, component }) => ({\n  velocityX: actions.includes("move-right") ? Number(component.values.speed ?? 180) : 0,\n  velocityY: 0,\n});\n\nObject.defineProperty(update, "definition", { value: Object.freeze(updateDefinition) });\n`;
}

function replaceDefinitionModuleLiteral(source: string, from: string, to: string) {
  const quoted = JSON.stringify(from);
  const index = source.indexOf(`"module": ${quoted}`);
  if (index >= 0) return source.slice(0, index) + `"module": ${JSON.stringify(to)}` + source.slice(index + `"module": ${quoted}`.length);
  return source.replace(new RegExp(`(\\bmodule\\s*:\\s*)${escapeRegExp(quoted)}`), `$1${JSON.stringify(to)}`);
}

function writeDefinitions(project: EditorProject, definitions: readonly PlayableBehaviorDefinition2D[]) {
  project.extensions ??= {};
  project.extensions.hyperfocusBehaviorDefinitions = definitions.map((definition) => structuredClone(definition));
}

function validDefinition(value: unknown): value is PlayableBehaviorDefinition2D {
  if (!isRecord(value) || value.version !== 1 || typeof value.id !== "string" || typeof value.module !== "string" || typeof value.exportName !== "string" || typeof value.label !== "string" || typeof value.description !== "string" || !Array.isArray(value.fields) || !value.fields.every(validBehaviorField)) return false;
  if (value.category !== undefined && typeof value.category !== "string") return false;
  if (value.builtIn !== undefined && typeof value.builtIn !== "boolean") return false;
  return value.events === undefined || Array.isArray(value.events) && value.events.every((event) => isRecord(event) && typeof event.name === "string" && typeof event.label === "string" && (event.description === undefined || typeof event.description === "string"));
}

function validBehaviorField(value: unknown): boolean {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.label !== "string") return false;
  if (value.description !== undefined && typeof value.description !== "string" || value.group !== undefined && typeof value.group !== "string" || value.advanced !== undefined && typeof value.advanced !== "boolean" || value.optional !== undefined && typeof value.optional !== "boolean") return false;
  if (value.type === "number") return typeof value.default === "number" && Number.isFinite(value.default) && [value.minimum, value.maximum, value.step].every((item) => item === undefined || typeof item === "number" && Number.isFinite(item)) && (value.unit === undefined || typeof value.unit === "string");
  if (value.type === "boolean") return typeof value.default === "boolean";
  if (value.type === "text") return typeof value.default === "string" && (value.placeholder === undefined || typeof value.placeholder === "string");
  if (value.type === "select") return typeof value.default === "string" && Array.isArray(value.options) && value.options.every((option) => isRecord(option) && typeof option.value === "string" && typeof option.label === "string");
  return (value.type === "action" || value.type === "entity" || value.type === "asset" || value.type === "scene" || value.type === "state-key") && typeof value.default === "string";
}

function humanLabel(value: string) {
  const words = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Project behavior";
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

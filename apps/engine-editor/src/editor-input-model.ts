import type { EditorProject } from "@hyperfocus/engine/project";

export type EditorInputConflict = { binding: string; actions: string[] };
export type EditorInputActionUsage = { kind: "audio-trigger" | "component-field"; label: string; pointer: string };

export function addEditorInputAction(project: EditorProject, requestedAction: string): string {
  const action = normalizeAction(requestedAction);
  if (project.settings.input.some((mapping) => mapping.action === action)) throw new Error(`Input action already exists: ${action}`);
  project.settings.input.push({ action, bindings: [] });
  project.settings.input.sort((a, b) => a.action.localeCompare(b.action));
  return action;
}

export function renameEditorInputAction(project: EditorProject, currentAction: string, requestedAction: string): string {
  const mapping = requiredMapping(project, currentAction);
  const next = normalizeAction(requestedAction);
  if (project.settings.input.some((candidate) => candidate !== mapping && candidate.action === next)) throw new Error(`Input action already exists: ${next}`);
  const previous = mapping.action;
  mapping.action = next;
  for (const scene of project.scenes) for (const entity of scene.entities) for (const component of entity.components) {
    if (component.type === "audio" && component.values.trigger === `action:${previous}`) component.values.trigger = `action:${next}`;
    for (const [key, value] of Object.entries(component.values)) {
      if (isActionField(key) && value === previous) component.values[key] = next;
    }
  }
  project.settings.input.sort((a, b) => a.action.localeCompare(b.action));
  return next;
}

export function removeEditorInputAction(project: EditorProject, action: string): void {
  requiredMapping(project, action);
  const usages = findEditorInputActionUsages(project, action);
  if (usages.length) throw new Error(`Input action ${action} is used in ${usages.length} place${usages.length === 1 ? "" : "s"}. Rename it to update references, or detach those references before deleting it.`);
  const before = project.settings.input.length;
  project.settings.input = project.settings.input.filter((mapping) => mapping.action !== action);
  if (project.settings.input.length === before) throw new Error(`Input action does not exist: ${action}`);
}

export function findEditorInputActionUsages(project: EditorProject, action: string): EditorInputActionUsage[] {
  const usages: EditorInputActionUsage[] = [];
  for (const [sceneIndex, scene] of project.scenes.entries()) for (const [entityIndex, entity] of scene.entities.entries()) for (const [componentIndex, component] of entity.components.entries()) {
    const base = `/scenes/${sceneIndex}/entities/${entityIndex}/components/${componentIndex}/values`;
    if (component.type === "audio" && component.values.trigger === `action:${action}`) usages.push({ kind: "audio-trigger", label: `${scene.name} / ${entity.label} / audio trigger`, pointer: `${base}/trigger` });
    for (const [key, value] of Object.entries(component.values)) {
      if (isActionField(key) && value === action) usages.push({ kind: "component-field", label: `${scene.name} / ${entity.label} / ${component.type}.${key}`, pointer: `${base}/${key}` });
    }
  }
  return usages;
}

export function addEditorInputBinding(project: EditorProject, action: string, requestedBinding: string): EditorInputConflict[] {
  const mapping = requiredMapping(project, action);
  const binding = normalizeBinding(requestedBinding);
  if (!mapping.bindings.includes(binding)) mapping.bindings.push(binding);
  mapping.bindings.sort();
  return editorInputConflicts(project).filter((conflict) => conflict.binding === binding);
}

export function removeEditorInputBinding(project: EditorProject, action: string, binding: string): void {
  const mapping = requiredMapping(project, action);
  const before = mapping.bindings.length;
  mapping.bindings = mapping.bindings.filter((candidate) => candidate !== binding);
  if (mapping.bindings.length === before) throw new Error(`${action} does not use ${binding}.`);
}

export function editorInputConflicts(project: EditorProject): EditorInputConflict[] {
  const actionsByBinding = new Map<string, string[]>();
  for (const mapping of project.settings.input) for (const binding of mapping.bindings) {
    const actions = actionsByBinding.get(binding) ?? [];
    actions.push(mapping.action);
    actionsByBinding.set(binding, actions);
  }
  return [...actionsByBinding].filter(([, actions]) => actions.length > 1).map(([binding, actions]) => ({ binding, actions: [...actions].sort() }));
}

export function keyboardEventBinding(event: Pick<KeyboardEvent, "code">): string {
  if (event.code === "Unidentified" || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(event.code)) {
    throw new Error(`Unsupported keyboard binding: ${event.code}`);
  }
  return event.code;
}

export function gamepadBinding(gamepadIndex: number, buttonIndex: number): string {
  if (!Number.isInteger(gamepadIndex) || gamepadIndex < 0 || gamepadIndex > 15 || !Number.isInteger(buttonIndex) || buttonIndex < 0 || buttonIndex > 255) throw new Error("Gamepad binding is out of range.");
  return `Gamepad${gamepadIndex}.Button${buttonIndex}`;
}

function requiredMapping(project: EditorProject, action: string) {
  const mapping = project.settings.input.find((candidate) => candidate.action === action);
  if (!mapping) throw new Error(`Input action does not exist: ${action}`);
  return mapping;
}

function normalizeAction(value: string) {
  const action = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9._:/-]{0,127}$/.test(action)) throw new Error("Input action must be a portable name using letters, numbers, dot, underscore, colon, slash, or dash.");
  return action;
}

function normalizeBinding(value: string) {
  const binding = value.trim();
  if (!binding || binding.length > 128 || !/^[A-Za-z0-9._:/-]+$/.test(binding)) throw new Error("Input binding is invalid.");
  return binding;
}

function isActionField(key: string) {
  return key === "action" || /Action$/.test(key);
}

import type { EditorProject } from "@hyperfocus/engine/project";
import { isEditorModeId } from "./app/editor-session.ts";

/** Visual/runtime compatibility actions. Project mutation belongs in the editor command session. */

export type EditorAgentTarget =
  | { selector: string }
  | { editorAction: string; template?: string; componentId?: string; componentType?: string }
  | { editorMode: "edit" | "play" | "profile" | "build" }
  | { workspace: string }
  | { projectEntity: string }
  | { projectScene: string }
  | { scriptPath: string }
  | { scene3dEntity: string };

export type EditorAgentFile = {
  name: string;
  type?: string;
  /** Base64 without a data-URL prefix. */
  base64: string;
};

export type EditorAgentAction =
  | { type: "click"; target: EditorAgentTarget }
  | { type: "input"; target: EditorAgentTarget; value: string | number }
  | { type: "check"; target: EditorAgentTarget; checked: boolean }
  | { type: "key"; key: string; code?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean; target?: EditorAgentTarget }
  | { type: "pointer"; target: EditorAgentTarget; event?: "click" | "dblclick" | "pointerdown" | "pointermove" | "pointerup"; x?: number; y?: number; button?: number; buttons?: number }
  | { type: "drag"; from: EditorAgentTarget; to: EditorAgentTarget; data?: Record<string, string> }
  | { type: "upload"; input: "project" | "assets" | EditorAgentTarget; files: EditorAgentFile[] }
  | { type: "wait"; milliseconds: number };

export type EditorAgentPlan = {
  requestId: string;
  intent: string;
  actions: EditorAgentAction[];
};

export type EditorAgentControl = {
  element: string;
  label: string;
  target: EditorAgentTarget;
  disabled: boolean;
  value?: string;
  checked?: boolean;
};

export type EditorAgentSnapshot = {
  schema: "hyperfocus-editor-agent-snapshot-v1";
  capturedAt: string;
  url: string;
  title: string;
  ready: boolean;
  project: EditorProject;
  projectDirty: boolean;
  mode: string;
  workspace: string;
  selectedEntityId: string | null;
  center: string | null;
  focused: string | null;
  messages: string[];
  controls: EditorAgentControl[];
};

export type EditorAgentHandoff = {
  schema: "hyperfocus-editor-agent-handoff-v1";
  requestId: string;
  intent: string;
  ok: boolean;
  startedAt: string;
  completedAt: string;
  completedActions: number;
  results: Array<{ index: number; type: EditorAgentAction["type"]; ok: boolean; detail: string }>;
  error?: string;
  snapshot: EditorAgentSnapshot;
  next: {
    verify: string[];
    unresolved: string[];
  };
};

export type EditorAgentBridge = {
  readonly ready: true;
  listActions(): readonly EditorAgentAction["type"][];
  snapshot(): EditorAgentSnapshot;
  perform(plan: EditorAgentPlan): Promise<EditorAgentHandoff>;
};

declare global {
  var __hyperfocusEditorAgent: EditorAgentBridge | undefined;
}

const actionTypes = ["click", "input", "check", "key", "pointer", "drag", "upload", "wait"] as const;

export function createEditorAgentBridge(options: { getProject(): EditorProject; isReady?(): boolean }): EditorAgentBridge {
  return {
    ready: true,
    listActions: () => actionTypes,
    snapshot: () => captureSnapshot(options),
    async perform(plan) {
      const request = parseEditorAgentPlan(plan);
      const startedAt = new Date().toISOString();
      const results: EditorAgentHandoff["results"] = [];
      let error: string | undefined;
      for (const [index, action] of request.actions.entries()) {
        try {
          const detail = await performAction(action);
          results.push({ index, type: action.type, ok: true, detail });
        } catch (cause) {
          error = cause instanceof Error ? cause.message : String(cause);
          results.push({ index, type: action.type, ok: false, detail: error });
          break;
        }
      }
      await afterPaint();
      return {
        schema: "hyperfocus-editor-agent-handoff-v1",
        requestId: request.requestId,
        intent: request.intent,
        ok: error === undefined,
        startedAt,
        completedAt: new Date().toISOString(),
        completedActions: results.filter((result) => result.ok).length,
        results,
        ...(error ? { error } : {}),
        snapshot: captureSnapshot(options),
        next: {
          verify: ["Confirm snapshot mode, workspace, selection, dirty state, and visible controls match the intent."],
          unresolved: error ? [error] : [],
        },
      };
    },
  };
}

export function parseEditorAgentPlan(value: unknown): EditorAgentPlan {
  const plan = requireRecord(value, "Agent plan");
  const requestId = requireString(plan.requestId, "Agent plan requestId");
  const intent = requireString(plan.intent, "Agent plan intent");
  if (!Array.isArray(plan.actions) || plan.actions.length > 200) throw new Error("Agent plan actions must be an array of at most 200 actions.");
  return { requestId, intent, actions: plan.actions.map(parseAgentAction) };
}

function parseAgentAction(value: unknown): EditorAgentAction {
  const action = requireRecord(value, "Agent action");
  if (action.type === "wait") return { type: "wait", milliseconds: requireNumber(action.milliseconds, "wait milliseconds") };
  if (action.type === "click") return { type: "click", target: parseAgentTarget(action.target) };
  if (action.type === "input") {
    if (typeof action.value !== "string" && typeof action.value !== "number") throw new TypeError("input value must be a string or number.");
    return { type: "input", target: parseAgentTarget(action.target), value: action.value };
  }
  if (action.type === "check") return { type: "check", target: parseAgentTarget(action.target), checked: requireBoolean(action.checked, "check checked") };
  if (action.type === "key") return {
    type: "key",
    key: requireString(action.key, "key key"),
    ...optionalStringProperty(action, "code"),
    ...optionalBooleanProperty(action, "ctrl"),
    ...optionalBooleanProperty(action, "alt"),
    ...optionalBooleanProperty(action, "shift"),
    ...optionalBooleanProperty(action, "meta"),
    ...(action.target === undefined ? {} : { target: parseAgentTarget(action.target) }),
  };
  if (action.type === "pointer") return {
    type: "pointer",
    target: parseAgentTarget(action.target),
    ...(isPointerEvent(action.event) ? { event: action.event } : {}),
    ...optionalNumberProperty(action, "x"),
    ...optionalNumberProperty(action, "y"),
    ...optionalNumberProperty(action, "button"),
    ...optionalNumberProperty(action, "buttons"),
  };
  if (action.type === "drag") return {
    type: "drag",
    from: parseAgentTarget(action.from),
    to: parseAgentTarget(action.to),
    ...(action.data === undefined ? {} : { data: parseStringRecord(action.data, "drag data") }),
  };
  if (action.type === "upload") {
    if (!Array.isArray(action.files)) throw new TypeError("upload files must be an array.");
    const input = action.input === "project" || action.input === "assets" ? action.input : parseAgentTarget(action.input);
    return { type: "upload", input, files: action.files.map(parseAgentFile) };
  }
  throw new TypeError("Agent action has an unsupported type.");
}

function parseAgentTarget(value: unknown): EditorAgentTarget {
  const target = requireRecord(value, "Agent target");
  if (typeof target.selector === "string") return { selector: target.selector };
  if (typeof target.editorAction === "string") return {
    editorAction: target.editorAction,
    ...optionalStringProperty(target, "template"),
    ...optionalStringProperty(target, "componentId"),
    ...optionalStringProperty(target, "componentType"),
  };
  if (target.editorMode === "edit" || target.editorMode === "play" || target.editorMode === "profile" || target.editorMode === "build") return { editorMode: target.editorMode };
  if (typeof target.workspace === "string") return { workspace: target.workspace };
  if (typeof target.projectEntity === "string") return { projectEntity: target.projectEntity };
  if (typeof target.projectScene === "string") return { projectScene: target.projectScene };
  if (typeof target.scriptPath === "string") return { scriptPath: target.scriptPath };
  if (typeof target.scene3dEntity === "string") return { scene3dEntity: target.scene3dEntity };
  throw new TypeError("Agent target has no supported selector.");
}

function parseAgentFile(value: unknown): EditorAgentFile {
  const file = requireRecord(value, "Agent upload file");
  return { name: requireString(file.name, "upload file name"), base64: requireString(file.base64, "upload file base64"), ...optionalStringProperty(file, "type") };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a boolean.`);
  return value;
}

function optionalStringProperty(record: Record<string, unknown>, key: string): Record<string, string> {
  const value = record[key];
  if (value === undefined) return {};
  if (typeof value !== "string") throw new TypeError(`${key} must be a string.`);
  return Object.fromEntries([[key, value]]);
}

function optionalNumberProperty(record: Record<string, unknown>, key: string): Record<string, number> {
  const value = record[key];
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${key} must be a finite number.`);
  return Object.fromEntries([[key, value]]);
}

function optionalBooleanProperty(record: Record<string, unknown>, key: string): Record<string, boolean> {
  const value = record[key];
  if (value === undefined) return {};
  if (typeof value !== "boolean") throw new TypeError(`${key} must be a boolean.`);
  return Object.fromEntries([[key, value]]);
}

function parseStringRecord(value: unknown, label: string): Record<string, string> {
  const record = requireRecord(value, label);
  const entries: Array<[string, string]> = [];
  for (const [key, item] of Object.entries(record)) {
    if (typeof item !== "string") throw new TypeError(`${label}.${key} must be a string.`);
    entries.push([key, item]);
  }
  return Object.fromEntries(entries);
}

function isPointerEvent(value: unknown): value is "click" | "dblclick" | "pointerdown" | "pointermove" | "pointerup" {
  return value === "click" || value === "dblclick" || value === "pointerdown" || value === "pointermove" || value === "pointerup";
}

async function performAction(action: EditorAgentAction) {
  if (action.type === "wait") {
    if (!Number.isFinite(action.milliseconds) || action.milliseconds < 0 || action.milliseconds > 10_000) throw new Error("wait milliseconds must be from 0 through 10000.");
    await new Promise((resolve) => setTimeout(resolve, action.milliseconds));
    return `Waited ${action.milliseconds} ms.`;
  }
  if (action.type === "key") {
    const target = action.target ? resolveTarget(action.target) : document.activeElement ?? document.body;
    const init: KeyboardEventInit = { key: action.key, code: action.code ?? action.key, ctrlKey: action.ctrl, altKey: action.alt, shiftKey: action.shift, metaKey: action.meta, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
    return `Pressed ${action.key}.`;
  }
  if (action.type === "upload") {
    const input = typeof action.input === "string" ? resolveFileInput(action.input) : resolveTarget(action.input);
    if (!(input instanceof HTMLInputElement) || input.type !== "file") throw new Error("Upload target is not a file input.");
    if (!action.files.length) throw new Error("Upload requires at least one file.");
    const transfer = new DataTransfer();
    for (const source of action.files) transfer.items.add(new File([decodeBase64(source.base64)], source.name, { type: source.type ?? "application/octet-stream" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return `Uploaded ${action.files.length} file(s).`;
  }
  if (action.type === "drag") {
    const from = resolveTarget(action.from);
    const to = resolveTarget(action.to);
    const transfer = new DataTransfer();
    for (const [type, value] of Object.entries(action.data ?? {})) transfer.setData(type, value);
    from.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    from.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
    return "Completed drag and drop.";
  }
  const target = resolveTarget(action.target);
  if (action.type === "click") {
    if (!(target instanceof HTMLElement)) throw new Error("Click target is not an HTML element.");
    target.click();
    return `Clicked ${describeElement(target)}.`;
  }
  if (action.type === "input") {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) throw new Error("Input target does not accept a value.");
    target.value = String(action.value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return `Set ${describeElement(target)}.`;
  }
  if (action.type === "check") {
    if (!(target instanceof HTMLInputElement) || !["checkbox", "radio"].includes(target.type)) throw new Error("Check target is not a checkbox or radio input.");
    target.checked = action.checked;
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return `${action.checked ? "Checked" : "Unchecked"} ${describeElement(target)}.`;
  }
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + (action.x ?? rect.width / 2);
  const clientY = rect.top + (action.y ?? rect.height / 2);
  const eventType = action.event ?? "click";
  const init: PointerEventInit = { bubbles: true, cancelable: true, clientX, clientY, button: action.button ?? 0, buttons: action.buttons ?? (eventType === "pointerup" ? 0 : 1), pointerId: 1, pointerType: "mouse", isPrimary: true };
  if (eventType === "click" || eventType === "dblclick") target.dispatchEvent(new MouseEvent(eventType, init));
  else target.dispatchEvent(new PointerEvent(eventType, init));
  return `Dispatched ${eventType} to ${describeElement(target)}.`;
}

function resolveFileInput(kind: "project" | "assets") {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')];
  const input = inputs.find((candidate) => kind === "project" ? candidate.accept.includes(".hfp") : candidate.accept.includes("image/"));
  if (!input) throw new Error(`Could not find the ${kind} file input.`);
  return input;
}

function resolveTarget(target: EditorAgentTarget): Element {
  let selector: string;
  if ("selector" in target) selector = target.selector;
  else if ("editorAction" in target) {
    selector = `[data-editor-action=${cssString(target.editorAction)}]`;
    if (target.template) selector += `[data-template=${cssString(target.template)}]`;
    if (target.componentId) selector += `[data-component-id=${cssString(target.componentId)}]`;
    if (target.componentType) selector += `[data-component-type=${cssString(target.componentType)}]`;
  } else if ("editorMode" in target) selector = `[data-editor-mode=${cssString(target.editorMode)}]`;
  else if ("workspace" in target) selector = `[data-workspace-tab=${cssString(target.workspace)}]`;
  else if ("projectEntity" in target) selector = `[data-project-entity=${cssString(target.projectEntity)}]`;
  else if ("projectScene" in target) selector = `[data-project-scene=${cssString(target.projectScene)}]`;
  else if ("scriptPath" in target) selector = `[data-script-path=${cssString(target.scriptPath)}]`;
  else selector = `[data-3d-entity=${cssString(target.scene3dEntity)}]`;
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Editor agent target was not found: ${selector}`);
  return element;
}

function captureSnapshot(options: { getProject(): EditorProject; isReady?(): boolean }): EditorAgentSnapshot {
  const controls = [...document.querySelectorAll<HTMLElement>("button,input,select,textarea,canvas,[role=button],[role=tab],[contenteditable=true],[draggable=true]")]
    .filter(isVisible)
    .slice(0, 500)
    .map(controlSnapshot)
    .filter((control): control is EditorAgentControl => control !== null);
  const editor = globalThis.__engineEditor;
  const selectedEntityId = editor?.selectedEntityId ?? null;
  const center = document.querySelector<HTMLElement>("[data-center-tab].is-active")?.dataset.centerTab ?? null;
  return {
    schema: "hyperfocus-editor-agent-snapshot-v1",
    capturedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    ready: options.isReady?.() ?? editor?.ready === true,
    project: structuredClone(options.getProject()),
    projectDirty: document.querySelector("#editor-project-state")?.classList.contains("is-dirty") ?? false,
    mode: document.documentElement.dataset.editorMode ?? "unknown",
    workspace: editor?.activeWorkspace ?? document.querySelector<HTMLElement>("[data-workspace].is-active")?.dataset.workspace ?? "unknown",
    selectedEntityId,
    center,
    focused: document.activeElement instanceof Element ? describeElement(document.activeElement) : null,
    messages: captureMessages(),
    controls,
  };
}

function controlSnapshot(element: HTMLElement): EditorAgentControl | null {
  const target = targetForElement(element);
  if (!target) return null;
  const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element : undefined;
  return {
    element: element.tagName.toLowerCase(),
    label: accessibleLabel(element),
    target,
    disabled: formControlDisabled(element),
    ...(field ? { value: field.value } : {}),
    ...(element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) ? { checked: element.checked } : {}),
  };
}

function targetForElement(element: HTMLElement): EditorAgentTarget | null {
  if (element.dataset.editorAction) return { editorAction: element.dataset.editorAction, ...(element.dataset.template ? { template: element.dataset.template } : {}), ...(element.dataset.componentId ? { componentId: element.dataset.componentId } : {}), ...(element.dataset.componentType ? { componentType: element.dataset.componentType } : {}) };
  if (element.dataset.editorMode && isEditorModeId(element.dataset.editorMode)) return { editorMode: element.dataset.editorMode };
  if (element.dataset.workspaceTab) return { workspace: element.dataset.workspaceTab };
  if (element.dataset.projectEntity) return { projectEntity: element.dataset.projectEntity };
  if (element.dataset.projectScene) return { projectScene: element.dataset.projectScene };
  if (element.dataset.scriptPath) return { scriptPath: element.dataset.scriptPath };
  if (element.dataset["3dEntity"]) return { scene3dEntity: element.dataset["3dEntity"]! };
  if (element.dataset.entityProperty) return { selector: `[data-entity-property=${cssString(element.dataset.entityProperty)}]` };
  if (element.dataset.componentId && element.dataset.componentKey) return { selector: `[data-component-id=${cssString(element.dataset.componentId)}][data-component-key=${cssString(element.dataset.componentKey)}]` };
  if (element.dataset["3dField"]) return { selector: `[data-3d-field=${cssString(element.dataset["3dField"]!)}]` };
  if (element.dataset.inputAction) return { selector: `[data-input-action=${cssString(element.dataset.inputAction)}]` };
  if (element.id) return { selector: `#${CSS.escape(element.id)}` };
  const name = element.getAttribute("name");
  return name ? { selector: `${element.tagName.toLowerCase()}[name=${cssString(name)}]` } : null;
}

function accessibleLabel(element: HTMLElement) {
  return element.getAttribute("aria-label")?.trim()
    || element.getAttribute("title")?.trim()
    || element.closest("label")?.textContent?.trim()
    || element.textContent?.trim()
    || element.id
    || element.tagName.toLowerCase();
}

function isVisible(element: HTMLElement) {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  return !element.closest("[hidden]");
}

function describeElement(element: Element) {
  if (element.id) return `#${element.id}`;
  return element instanceof HTMLElement && element.dataset.editorAction
    ? `[data-editor-action=${element.dataset.editorAction}]`
    : element.tagName.toLowerCase();
}

function formControlDisabled(element: HTMLElement): boolean {
  return element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
    ? element.disabled
    : false;
}

function captureMessages() {
  const selectors = ["#editor-announcer", "#editor-toast", "#footer-status", "#production-footer-status", "#editor-console-output"];
  return [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll<HTMLElement>(selector)]).flatMap((element) => {
    if (element.id === "editor-console-output") return [...element.children].slice(0, 20).map((child) => child.textContent?.trim() ?? "");
    return [element.textContent?.trim() ?? ""];
  }).filter(Boolean))];
}

function cssString(value: string) {
  return JSON.stringify(value);
}

function decodeBase64(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) throw new Error("Uploaded file contents must be valid base64 without a data-URL prefix.");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function afterPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

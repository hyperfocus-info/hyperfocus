export function requireDescendant<TElement extends Element>(root: ParentNode, selector: string): TElement {
  const element = root.querySelector<TElement>(selector);
  if (!element) throw new Error(`Engine Editor markup is missing descendant ${selector}`);
  return element;
}

export function requireArrayItem<TValue>(values: readonly TValue[], index: number, label: string): TValue {
  const value = values[index];
  if (value === undefined) throw new RangeError(`${label} index ${index} is out of bounds.`);
  return value;
}

export function requireMapValue<TKey, TValue>(values: ReadonlyMap<TKey, TValue>, key: TKey, label: string): TValue {
  const value = values.get(key);
  if (value === undefined) throw new Error(`${label} is missing ${String(key)}.`);
  return value;
}

export function requireDataset(element: HTMLElement, key: string): string {
  const value = element.dataset[key];
  if (!value) throw new Error(`Engine Editor markup is missing data-${toKebabCase(key)}.`);
  return value;
}

export function requireEventCurrentTarget<TTarget extends EventTarget>(
  event: Event,
  Target: new (...args: never[]) => TTarget,
): TTarget {
  if (!(event.currentTarget instanceof Target)) throw new TypeError("Engine Editor event currentTarget has an unexpected type.");
  return event.currentTarget;
}

export function requireOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[], label: string): TValue {
  for (const candidate of allowed) if (candidate === value) return candidate;
  throw new TypeError(`${label} has an unsupported value.`);
}

export function isOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[]): value is TValue {
  return typeof value === "string" && allowed.some((candidate) => candidate === value);
}

export function optionalOneOf<TValue extends string>(value: unknown, allowed: readonly TValue[]): TValue | undefined {
  return isOneOf(value, allowed) ? value : undefined;
}

export function eventElementTarget(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}

export function isAbortError(error: unknown): boolean {
  return error !== null && typeof error === "object" && Reflect.get(error, "name") === "AbortError";
}

export function requireInitialized<TValue>(value: TValue | undefined, label: string): TValue {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

export function toEditorComponents(components: ReadonlyArray<Omit<EditorComponent, "type"> & { type: string }>): EditorComponent[] {
  return components.map((component) => ({
    ...structuredClone(component),
    type: requireOneOf(component.type, EDITOR_COMPONENT_TYPES, "editor component type"),
  }));
}

export function isMidiAccess(value: unknown): value is MIDIAccess {
  if (value === null || typeof value !== "object") return false;
  const inputs = Reflect.get(value, "inputs");
  return inputs !== null && typeof inputs === "object" && typeof Reflect.get(inputs, "values") === "function";
}

export function createRejectingFetch(createError: () => Error): typeof fetch {
  const reject = async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => { throw createError(); };
  reject.preconnect = (...args: Parameters<typeof fetch.preconnect>) => fetch.preconnect(...args);
  return reject;
}

function toKebabCase(value: string) {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}
import type { EditorComponent } from "@hyperfocus/engine/project";

export const EDITOR_COMPONENT_TYPES: readonly EditorComponent["type"][] = ["transform", "sprite", "collider", "input", "behavior", "camera", "audio", "ui"];

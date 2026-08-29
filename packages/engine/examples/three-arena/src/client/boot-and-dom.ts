import type { AssetLoadTaskContext } from "@hyperfocus/engine/assets/loader";
import { localThreeModules, threeView } from "./boot-context.ts";
import type { LocalThreeModules } from "./boot-context.ts";
import { isCompleteThreeNamespace, isEngineThreeModule, requireCompleteThreeNamespace, requireEngineThreeModule } from "./three-guards.ts";

export { isCompleteThreeNamespace, isEngineThreeModule, requireCompleteThreeNamespace, requireEngineThreeModule };

export function requireLocalThreeModules(): LocalThreeModules {
  if (!localThreeModules) throw new Error("Three Arena local runtime modules were not loaded.");
  return localThreeModules;
}

export const runtimeThreeModules = requireLocalThreeModules();

export const THREE = requireCompleteThreeNamespace(threeView.THREE);

export type RuntimeConstructor<T> = abstract new (...args: never[]) => T;

export function requireRuntimeInstance<T>(value: unknown, constructor: RuntimeConstructor<T>, label: string): T {
  if (!(value instanceof constructor)) throw new Error(`${label} has an unexpected runtime type.`);
  return value;
}
export const bootState: { taskContext: AssetLoadTaskContext | null } = {
  taskContext: null,
};
export function requiredHtmlElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Required HTML element not found: ${selector}`);
  return element;
}

export function requiredButton(selector: string): HTMLButtonElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Required button not found: ${selector}`);
  return element;
}

export function requiredInput(selector: string): HTMLInputElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Required input not found: ${selector}`);
  return element;
}

export function requiredCanvas(selector: string): HTMLCanvasElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`Required canvas not found: ${selector}`);
  return element;
}

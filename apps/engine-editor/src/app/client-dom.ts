import type { Renderable } from '@hyperfocus/engine/render';
export const requireElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Engine Editor markup is missing ${selector}`);
  return element;
};

export const setText = (selector: string, value: string) => {
  requireElement<HTMLElement>(selector).textContent = value;
};

const markupEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeMarkup = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => markupEscapes[character] ?? character);

export function requireRenderableTarget(value: unknown): Renderable[] {
  if (!Array.isArray(value)) throw new TypeError("Stage render target must be an array.");
  return value;
}

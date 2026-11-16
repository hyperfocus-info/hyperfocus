/** Resolve authored markup and prove its actual node type. Constructors and the
 * document belong to the caller's DOM realm; no DOM is accessed at import time. */
export function requireDomId<T extends Element>(id: string, Target: new (...args: never[]) => T, root: Document = document): T {
  const element = root.getElementById(id);
  if (!(element instanceof Target)) throw new TypeError(`Missing or unexpected DOM element #${id}`);
  return element;
}

export function requireInput(id: string, root: Document = document) {
  return requireDomId(id, HTMLInputElement, root);
}

export function requireButton(id: string, root: Document = document) {
  return requireDomId(id, HTMLButtonElement, root);
}

export function requireHtmlElement(id: string, root: Document = document) {
  return requireDomId(id, HTMLElement, root);
}

export function clickButton(id: string, root: Document = document) {
  requireButton(id, root).click();
}

export function requireEventTarget<T extends EventTarget>(event: Event, Target: new (...args: never[]) => T): T {
  if (!(event.target instanceof Target)) throw new TypeError("Unexpected DOM event target type");
  return event.target;
}

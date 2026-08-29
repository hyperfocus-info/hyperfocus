import { afterEach, beforeAll, describe } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { mountTestUiProviders } from "./test-ui-providers";

function ensureHappyDom() {
  if (globalThis.__padPilotHappyDomRegistered) {
    return;
  }

  GlobalRegistrator.register();
  globalThis.__padPilotHappyDomRegistered = true;
}

ensureHappyDom();
const { cleanup } = await import("@solidjs/testing-library");

export const createUiTest = (componentName: string, suite: () => void) => {
  beforeAll(() => {
    ensureHappyDom();
    mountTestUiProviders();
  });

  describe(componentName, () => {
    afterEach(() => {
      cleanup();
    });

    suite();
  });
};

export function requireButton(element: Element | null | undefined) {
  if (!(element instanceof HTMLButtonElement)) throw new Error("Expected button");
  return element;
}

export function requireElement(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error("Expected element");
  return element;
}

export function requireTextArea(element: HTMLElement) {
  if (!(element instanceof HTMLTextAreaElement)) throw new Error("Expected textarea");
  return element;
}

export function requireInput(element: Element | null | undefined) {
  if (!(element instanceof HTMLInputElement)) throw new Error("Expected input");
  return element;
}

export function requireDetails(element: Element | null | undefined) {
  if (!(element instanceof HTMLDetailsElement)) throw new Error("Expected details");
  return element;
}

export function setTestUrl(url: string) {
  const happyDom: unknown = Reflect.get(window, "happyDOM");
  if (!happyDom || typeof happyDom !== "object") {
    throw new Error("Expected Happy DOM window controller");
  }
  const setUrl: unknown = Reflect.get(happyDom, "setURL");
  if (typeof setUrl !== "function") {
    throw new Error("Expected Happy DOM URL setter");
  }
  Reflect.apply(setUrl, happyDom, [url]);
}

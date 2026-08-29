const unusedDomOperation = () => {};

function hasFunction(value: object, name: string) {
  return typeof Reflect.get(value, name) === "function";
}

function isHtmlElementFixture(value: unknown): value is HTMLElement {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "style") === "object"
    && hasFunction(value, "addEventListener")
    && hasFunction(value, "removeEventListener")
    && hasFunction(value, "appendChild")
    && hasFunction(value, "getBoundingClientRect");
}

export function createHtmlElementFixture<T extends object>(overrides: T): T & HTMLElement {
  const element = Object.assign({
    style: {},
    addEventListener: unusedDomOperation,
    removeEventListener: unusedDomOperation,
    appendChild: <C>(child: C) => child,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  }, overrides);
  if (!isHtmlElementFixture(element)) throw new Error("HTML element fixture is missing a required DOM operation");
  return element;
}

function isHtmlCanvasElementFixture(value: unknown): value is HTMLCanvasElement {
  return isHtmlElementFixture(value)
    && typeof Reflect.get(value, "width") === "number"
    && typeof Reflect.get(value, "height") === "number"
    && hasFunction(value, "getContext");
}

export function createHtmlCanvasElementFixture<T extends object>(overrides: T): T & HTMLCanvasElement {
  const canvas = Object.assign(createHtmlElementFixture({
    width: 0,
    height: 0,
    parentElement: null,
    getContext: () => null,
  }), overrides);
  if (!isHtmlCanvasElementFixture(canvas)) throw new Error("Canvas element fixture is missing a required DOM operation");
  return canvas;
}

function isWindowFixture(value: unknown): value is Window & typeof globalThis {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "devicePixelRatio") === "number"
    && typeof Reflect.get(value, "innerWidth") === "number"
    && typeof Reflect.get(value, "innerHeight") === "number"
    && hasFunction(value, "addEventListener")
    && hasFunction(value, "removeEventListener");
}

export function createWindowFixture<T extends object>(overrides: T): T & Window & typeof globalThis {
  const windowFixture = Object.assign({
    devicePixelRatio: 1,
    innerWidth: 0,
    innerHeight: 0,
    addEventListener: unusedDomOperation,
    removeEventListener: unusedDomOperation,
  }, overrides);
  if (!isWindowFixture(windowFixture)) throw new Error("Window fixture is missing a required browser operation");
  return windowFixture;
}

function isDocumentFixture(value: unknown): value is Document {
  return typeof value === "object" && value !== null
    && isHtmlElementFixture(Reflect.get(value, "body"))
    && isHtmlElementFixture(Reflect.get(value, "documentElement"))
    && hasFunction(value, "addEventListener")
    && hasFunction(value, "removeEventListener")
    && hasFunction(value, "querySelector");
}

export function createDocumentFixture<T extends object>(overrides: T): T & Document {
  const documentFixture = Object.assign({
    body: createHtmlElementFixture({}),
    documentElement: createHtmlElementFixture({}),
    addEventListener: unusedDomOperation,
    removeEventListener: unusedDomOperation,
    querySelector: () => null,
  }, overrides);
  if (!isDocumentFixture(documentFixture)) throw new Error("Document fixture is missing a required browser operation");
  return documentFixture;
}

export type HtmlImageFixtureBehavior = "load" | "error" | "pending";

function isHtmlImageElementFixture(value: unknown): value is HTMLImageElement {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "src") === "string"
    && typeof Reflect.get(value, "complete") === "boolean"
    && typeof Reflect.get(value, "naturalWidth") === "number";
}

export function createHtmlImageElementFixture(behavior: HtmlImageFixtureBehavior): HTMLImageElement {
  let source = "";
  let complete = false;
  let naturalWidth = 0;
  let onload: CallableFunction | null = null;
  let onerror: CallableFunction | null = null;
  const image = {
    get src() {
      return source;
    },
    set src(value: string) {
      source = value;
      if (behavior === "pending") return;
      if (behavior === "load") {
        complete = true;
        naturalWidth = 1;
        if (onload) Reflect.apply(onload, undefined, []);
        return;
      }
      queueMicrotask(() => {
        if (onerror) Reflect.apply(onerror, undefined, []);
      });
    },
    get complete() {
      return complete;
    },
    get naturalWidth() {
      return naturalWidth;
    },
    get onload() {
      return onload;
    },
    set onload(callback: unknown) {
      onload = typeof callback === "function" ? callback : null;
    },
    get onerror() {
      return onerror;
    },
    set onerror(callback: unknown) {
      onerror = typeof callback === "function" ? callback : null;
    },
    decoding: "auto",
    loading: "eager",
  };
  if (!isHtmlImageElementFixture(image)) throw new Error("Image fixture is missing a required browser property");
  return image;
}

function isFontFaceFixture(value: unknown): value is FontFace {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "family") === "string"
    && typeof Reflect.get(value, "load") === "function";
}

export function createFontFaceFixture(family: string): FontFace {
  const face = {
    family,
    status: "loaded",
    load() {
      return Promise.resolve(face);
    },
  };
  if (!isFontFaceFixture(face)) throw new Error("Font face fixture is missing a required browser property");
  return face;
}

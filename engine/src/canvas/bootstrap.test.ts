import { expect, test } from "bun:test";
import { init } from "./bootstrap.ts";

function createCanvas() {
  const listeners = new Map<string, Set<(event: any) => void>>();
  return {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    parentElement: null as any,
    getContext() {
      return { setTransform() {} };
    },
    addEventListener(type: string, handler: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(handler);
    },
    removeEventListener(type: string, handler: (event: any) => void) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type: string, event: any = {}) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    }
  } as unknown as HTMLCanvasElement;
}

function createParent(width: number, height: number) {
  const parent: any = {
    getBoundingClientRect: () => ({ width, height }),
    appendChild(child: any) {
      child.parentElement = parent;
      return child;
    }
  };
  return parent as HTMLElement;
}

test("init scale modes distinguish aspect fit from viewport stretch", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;

  const windowStub = {
    devicePixelRatio: 2,
    innerWidth: 800,
    innerHeight: 600,
    addEventListener() {},
    removeEventListener() {},
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {}
  } as unknown as Window & typeof globalThis;
  const body = createParent(800, 600);
  const documentStub = {
    body,
    documentElement: createParent(800, 600),
    createElement: () => createCanvas(),
    querySelector: () => null
  } as unknown as Document;

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame.bind(windowStub);
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame.bind(windowStub);

  try {
    const fitCanvas = createCanvas();
    const fit = init({ canvas: fitCanvas, parent: createParent(800, 600), width: 400, height: 200, scaleMode: "fit", autoStart: false });
    expect(fitCanvas.width).toBe(800);
    expect(fitCanvas.height).toBe(400);
    expect(fitCanvas.style.width).toBe("800px");
    expect(fitCanvas.style.height).toBe("400px");
    expect(fitCanvas.style.margin).toBe("0");
    fit.destroy();

    const stretchCanvas = createCanvas();
    const stretch = init({ canvas: stretchCanvas, parent: createParent(800, 600), width: 400, height: 200, scaleMode: "stretch", autoStart: false });
    expect(stretchCanvas.style.width).toBe("800px");
    expect(stretchCanvas.style.height).toBe("600px");
    stretch.destroy();

    const letterboxCanvas = createCanvas();
    const letterbox = init({ canvas: letterboxCanvas, parent: createParent(800, 600), width: 400, height: 200, scaleMode: "letterbox", autoStart: false });
    expect(letterboxCanvas.style.width).toBe("800px");
    expect(letterboxCanvas.style.height).toBe("400px");
    expect(letterboxCanvas.style.margin).toBe("auto");
    letterbox.destroy();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("init exposes a unified Canvas 2D backing-store recovery hook", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const canvas = createCanvas() as HTMLCanvasElement & { dispatch(type: string, event?: any): void };
  const parent = createParent(320, 180);
  const windowStub = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} } as unknown as Window & typeof globalThis;
  globalThis.window = windowStub;
  globalThis.document = { body: createParent(1, 1), documentElement: createParent(1, 1) } as unknown as Document;
  let lost = 0;
  let recovered = 0;
  let prevented = 0;
  try {
    const app = init({
      canvas,
      parent,
      autoStart: false,
      onContextLost: () => lost += 1,
      onContextRestored: async () => { recovered += 1; },
    });
    canvas.dispatch("contextlost", { preventDefault: () => prevented += 1 });
    canvas.dispatch("contextrestored", { preventDefault() {} });
    await app.recoverContext();
    expect({ lost, recovered, prevented }).toEqual({ lost: 1, recovered: 1, prevented: 1 });
    app.destroy();
    canvas.dispatch("contextrestored", { preventDefault() {} });
    expect(recovered).toBe(1);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test("stable viewport resizing waits for consecutive layout samples", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  const listeners = new Map<string, () => void>();
  let viewportWidth = 320;
  let viewportHeight = 180;
  const parent = {
    getBoundingClientRect: () => ({ width: viewportWidth, height: viewportHeight }),
    appendChild(child: any) { child.parentElement = parent; return child; },
  } as unknown as HTMLElement;
  const windowStub = {
    devicePixelRatio: 1,
    addEventListener(type: string, listener: () => void) { listeners.set(type, listener); },
    removeEventListener() {},
  } as unknown as Window & typeof globalThis;
  globalThis.window = windowStub;
  globalThis.document = { body: createParent(1, 1), documentElement: createParent(1, 1) } as unknown as Document;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  try {
    const canvas = createCanvas();
    const app = init({ canvas, parent, autoStart: false, width: 320, height: 180, resizeSettleFrames: 2, scaleMode: "stretch" });
    viewportHeight = 200;
    listeners.get("resize")?.();
    frames.shift()?.(1);
    viewportHeight = 220;
    frames.shift()?.(2);
    expect(canvas.style.height).toBe("180px");
    frames.shift()?.(3);
    expect(canvas.style.height).toBe("220px");
    app.destroy();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

test("init rejects invalid timing and stops cleanly when a frame callback throws", () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  let frame: FrameRequestCallback | undefined;
  const windowStub = {
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    addEventListener() {},
    removeEventListener() {}
  } as unknown as Window & typeof globalThis;
  const body = createParent(800, 600);
  globalThis.window = windowStub;
  globalThis.document = {
    body,
    documentElement: createParent(800, 600),
    createElement: () => createCanvas(),
    querySelector: () => null
  } as unknown as Document;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frame = callback;
    return 7;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

  try {
    expect(() => init({ canvas: createCanvas(), width: 0, autoStart: false })).toThrow("canvas width");
    expect(() => init({ canvas: createCanvas(), maxDelta: Number.NaN, autoStart: false })).toThrow("canvas maxDelta");

    const app = init({
      canvas: createCanvas(),
      autoStart: true,
      update() {
        throw new Error("update failed");
      }
    });
    expect(app.isRunning()).toBe(true);
    expect(() => frame?.(16)).toThrow("update failed");
    expect(app.isRunning()).toBe(false);
    app.destroy();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

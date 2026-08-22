import { expect, test } from "bun:test";
import { createBrowserApp } from "./browser-app.ts";

test("browser app composes explicit fixed-step lifecycle input and metrics", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  const canvas = {
    width: 0,
    height: 0,
    style: {} as Record<string, string>,
    parentElement: {} as HTMLElement,
    getContext: () => ({ canvas: { width: 320, height: 180 }, setTransform() {} }),
    addEventListener() {},
    removeEventListener() {}
  } as unknown as HTMLCanvasElement;
  const eventTarget = { addEventListener() {}, removeEventListener() {} };
  globalThis.window = {
    ...eventTarget,
    devicePixelRatio: 1,
    innerWidth: 320,
    innerHeight: 180
  } as unknown as Window & typeof globalThis;
  globalThis.document = {
    ...eventTarget,
    body: {} as HTMLElement,
    documentElement: {} as HTMLElement,
    querySelector: () => null
  } as unknown as Document;
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  let now = 0;
  let updates = 0;
  let renders = 0;

  try {
    const browserApp = createBrowserApp({
      canvas,
      width: 320,
      height: 180,
      step: 0.1,
      maxFrame: 1,
      input: { KeyA: "left" },
      metrics: { capacity: 8 },
      now: () => now,
      update() { updates += 1; },
      render() { renders += 1; }
    });

    expect(browserApp.isRunning()).toBe(false);
    expect(browserApp.resolvedConfig()).toEqual({ step: 0.1, maxFrame: 1, autoStart: false, input: true, metrics: true });
    browserApp.start();
    now = 100;
    frames[0](100);
    expect({ updates, renders, simulationTime: browserApp.simulationTime }).toEqual({ updates: 1, renders: 1, simulationTime: 0.1 });
    expect(browserApp.metrics?.snapshot().series["frame.ms"]).toBeDefined();
    browserApp.destroy();
    expect(browserApp.isRunning()).toBe(false);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

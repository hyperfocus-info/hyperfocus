import { expect, test } from "bun:test";
import {
  createDocumentFixture,
  createHtmlCanvasElementFixture,
  createHtmlElementFixture,
  createWindowFixture,
} from "../test-support/dom.ts";
import { createBrowserApp } from "./browser-app.ts";

test("browser app composes explicit fixed-step lifecycle input and metrics", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  const canvas = createHtmlCanvasElementFixture({
    width: 0,
    height: 0,
    parentElement: createHtmlElementFixture({}),
    getContext: () => ({ canvas: { width: 320, height: 180 }, setTransform() {} }),
  });
  globalThis.window = createWindowFixture({
    devicePixelRatio: 1,
    innerWidth: 320,
    innerHeight: 180
  });
  globalThis.document = createDocumentFixture({});
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

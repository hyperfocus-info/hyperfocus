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
      beforeUpdate() { now += 20; },
      update() { updates += 1; now += 3; },
      render() { renders += 1; now += 2; }
    });

    expect(browserApp.isRunning()).toBe(false);
    expect(browserApp.resolvedConfig()).toEqual({ step: 0.1, maxFrame: 1, autoStart: false, input: true, metrics: true });
    browserApp.start();
    now = 100;
    frames[0](100);
    expect({ updates, renders, simulationTime: browserApp.simulationTime }).toEqual({ updates: 1, renders: 1, simulationTime: 0.1 });
    expect(browserApp.metrics?.snapshot().series["frame.ms"]).toBeDefined();
    expect(browserApp.metrics?.snapshot().series['before-update.ms'].latest).toBe(20);
    expect(browserApp.metrics?.snapshot().series['frame.ms'].latest).toBe(25);
    now = 220;
    frames.at(-1)!(220);
    expect(browserApp.metrics?.snapshot().longFrames).toContainEqual({ metric: 'frame.gap.ms', durationMs: 120, at: 243 });
    const incidents = browserApp.metrics?.snapshot().longFrames.length;
    browserApp.stop();
    now = 2000;
    browserApp.start();
    frames.at(-1)!(2000);
    expect(browserApp.metrics?.snapshot().longFrames.length).toBe(incidents);
    browserApp.destroy();
    expect(browserApp.isRunning()).toBe(false);

    let clockReads = 0;
    const unmeasured = createBrowserApp({ canvas, width: 320, height: 180, step: 0.1, maxFrame: 1,
      metrics: false, now() { clockReads += 1; return 0; }, update() {}, render() {} });
    unmeasured.start();
    const readsAtStart = clockReads;
    frames.at(-1)!(100);
    frames.at(-1)!(200);
    expect(clockReads).toBe(readsAtStart);
    expect(unmeasured.simulationTime).toBe(0.2);
    unmeasured.destroy();
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  }
});

import { registerTestDom } from "../test-support/register-dom.ts";
import { expect, test } from "bun:test";
import { init } from "./bootstrap.ts";

registerTestDom();

function createCanvas() {
  const canvas = globalThis.document.createElement("canvas");
  Object.defineProperty(canvas, "getContext", {
    configurable: true,
    value: () => ({ setTransform() {} })
  });
  return canvas;
}

function createParent(measure: () => { width: number; height: number }) {
  const parent = globalThis.document.createElement("div");
  Object.defineProperty(parent, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      const { width, height } = measure();
      return { width, height, x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, toJSON: () => ({ width, height }) };
    }
  });
  return parent;
}

function fixedParent(width: number, height: number) {
  return createParent(() => ({ width, height }));
}

function setWindowMetrics(devicePixelRatio: number, innerWidth = 800, innerHeight = 600) {
  Object.defineProperties(globalThis.window, {
    devicePixelRatio: { configurable: true, value: devicePixelRatio },
    innerWidth: { configurable: true, value: innerWidth },
    innerHeight: { configurable: true, value: innerHeight }
  });
}

function installFrameScheduler(frames: FrameRequestCallback[] = []) {
  const previousRequest = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  return () => {
    globalThis.requestAnimationFrame = previousRequest;
    globalThis.cancelAnimationFrame = previousCancel;
  };
}

test("changing logical dimensions updates fit, backing store and later resizes together", () => {
  setWindowMetrics(2);
  const canvas = createCanvas();
  const app = init({ canvas, parent: fixedParent(808, 782), width: 760, height: 480, scaleMode: "fit" });
  app.resize({ width: 1240, height: 980 });
  expect([app.width, app.height, canvas.width, canvas.height]).toEqual([1240, 980, 2480, 1960]);
  expect([canvas.style.width, canvas.style.height]).toEqual(["808px", "638px"]);
  app.resize();
  expect([canvas.width, canvas.height, canvas.style.height]).toEqual([2480, 1960, "638px"]);
  expect(() => app.resize({ width: 100, height: 0 })).toThrow("canvas height");
  expect([app.width, app.height, canvas.width, canvas.height]).toEqual([1240, 980, 2480, 1960]);
  app.resize({ width: 1200, height: 720 });
  expect([canvas.width, canvas.height, canvas.style.height]).toEqual([2400, 1440, "484px"]);
  app.destroy();
});

test("init scale modes distinguish aspect fit from viewport stretch", () => {
  setWindowMetrics(2);
  const fitCanvas = createCanvas();
  const fit = init({ canvas: fitCanvas, parent: fixedParent(800, 600), width: 400, height: 200, scaleMode: "fit", autoStart: false });
  expect(fitCanvas.width).toBe(800);
  expect(fitCanvas.height).toBe(400);
  expect(fitCanvas.style.width).toBe("800px");
  expect(fitCanvas.style.height).toBe("400px");
  expect(fitCanvas.style.margin).toBe("0px");
  fit.destroy();

  const stretchCanvas = createCanvas();
  const stretch = init({ canvas: stretchCanvas, parent: fixedParent(800, 600), width: 400, height: 200, scaleMode: "stretch", autoStart: false });
  expect(stretchCanvas.style.width).toBe("800px");
  expect(stretchCanvas.style.height).toBe("600px");
  stretch.destroy();

  const letterboxCanvas = createCanvas();
  const letterbox = init({ canvas: letterboxCanvas, parent: fixedParent(800, 600), width: 400, height: 200, scaleMode: "letterbox", autoStart: false });
  expect(letterboxCanvas.style.width).toBe("800px");
  expect(letterboxCanvas.style.height).toBe("400px");
  expect(letterboxCanvas.style.margin).toBe("auto");
  letterbox.destroy();
});

test("init exposes a unified Canvas 2D backing-store recovery hook", async () => {
  setWindowMetrics(1);
  const canvas = createCanvas();
  let lost = 0;
  let recovered = 0;
  const app = init({
    canvas,
    parent: fixedParent(320, 180),
    autoStart: false,
    onContextLost: () => lost += 1,
    onContextRestored: async () => { recovered += 1; }
  });
  const lostEvent = new Event("contextlost", { cancelable: true });
  canvas.dispatchEvent(lostEvent);
  canvas.dispatchEvent(new Event("contextrestored"));
  await app.recoverContext();
  expect({ lost, recovered, prevented: lostEvent.defaultPrevented }).toEqual({ lost: 1, recovered: 1, prevented: true });
  app.destroy();
  canvas.dispatchEvent(new Event("contextrestored"));
  expect(recovered).toBe(1);
});

test("stable viewport resizing waits for consecutive layout samples", () => {
  setWindowMetrics(1);
  const frames: FrameRequestCallback[] = [];
  const restoreFrames = installFrameScheduler(frames);
  let viewportWidth = 320;
  let viewportHeight = 180;
  const parent = createParent(() => ({ width: viewportWidth, height: viewportHeight }));
  try {
    const canvas = createCanvas();
    const app = init({ canvas, parent, autoStart: false, width: 320, height: 180, resizeSettleFrames: 2, scaleMode: "stretch" });
    viewportHeight = 200;
    globalThis.window.dispatchEvent(new Event("resize"));
    frames.shift()?.(1);
    viewportHeight = 220;
    frames.shift()?.(2);
    expect(canvas.style.height).toBe("180px");
    frames.shift()?.(3);
    expect(canvas.style.height).toBe("220px");
    app.destroy();
  } finally {
    restoreFrames();
  }
});

test("container resizing updates a fitted canvas without a window resize", () => {
  setWindowMetrics(1);
  const previousObserver = globalThis.ResizeObserver;
  let viewportWidth = 320;
  let viewportHeight = 180;
  let observerCallback: ResizeObserverCallback | undefined;
  let observed: Element | undefined;
  let disconnected = false;
  const parent = createParent(() => ({ width: viewportWidth, height: viewportHeight }));
  function ResizeObserverStub(callback: ResizeObserverCallback) {
    observerCallback = callback;
    return {
      observe(target: Element) { observed = target; },
      unobserve() {},
      disconnect() { disconnected = true; }
    };
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverStub });
  try {
    const canvas = createCanvas();
    const app = init({ canvas, parent, autoStart: false, width: 320, height: 180, scaleMode: "fit" });
    expect(observed).toBe(parent);
    viewportWidth = 640;
    viewportHeight = 360;
    if (observerCallback) Reflect.apply(observerCallback, undefined, [[], undefined]);
    expect(canvas.style.width).toBe("640px");
    expect(canvas.style.height).toBe("360px");
    app.destroy();
    expect(disconnected).toBe(true);
  } finally {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: previousObserver });
  }
});

test("init rejects invalid timing and stops cleanly when a frame callback throws", () => {
  setWindowMetrics(1);
  const frames: FrameRequestCallback[] = [];
  const restoreFrames = installFrameScheduler(frames);
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
    expect(() => frames.shift()?.(16)).toThrow("update failed");
    expect(app.isRunning()).toBe(false);
    app.destroy();
  } finally {
    restoreFrames();
  }
});

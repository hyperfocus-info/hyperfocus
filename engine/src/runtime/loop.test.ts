import { expect, test } from "bun:test";
import { createFixedStepDriver, createFixedStepLoop } from "./loop.ts";

test("fixed step driver supports timestamp and deterministic delta advancement", () => {
  const calls: string[] = [];
  const driver = createFixedStepDriver({
    step: 0.125,
    maxFrame: 0.25,
    beforeUpdate: () => calls.push("before"),
    update: () => calls.push("update"),
    afterUpdate: () => calls.push("after"),
    render: (alpha) => calls.push(`render:${alpha.toFixed(1)}`)
  });

  driver.reset(1000);
  expect(driver.advance(1250)).toEqual({ rawDelta: 0.25, delta: 0.25, updates: 2, alpha: 0, interrupted: false });
  expect(calls).toEqual(["before", "update", "after", "before", "update", "after", "render:0.0"]);

  calls.length = 0;
  expect(driver.advanceBy(1)).toEqual({ rawDelta: 1, delta: 0.25, updates: 2, alpha: 0, interrupted: false });
  expect(calls.at(-1)).toBe("render:0.0");
});

test("fixed step driver can be interrupted between callbacks", () => {
  let active = true;
  let renders = 0;
  const driver = createFixedStepDriver({
    step: 0.05,
    maxFrame: 0.05,
    update: () => { active = false; },
    render: () => { renders += 1; }
  });

  const result = driver.advanceBy(0.05, { shouldContinue: () => active });
  expect(result.interrupted).toBe(true);
  expect(result.updates).toBe(0);
  expect(renders).toBe(0);
});

test("fixed step loop exposes pause and resume aliases", () => {
  const queuedFrames: FrameRequestCallback[] = [];
  const canceledFrames: number[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (callback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = (id) => {
    canceledFrames.push(id);
  };

  try {
    let updates = 0;
    let renders = 0;
    let clock = 1000;
    const loop = createFixedStepLoop({
      step: 0.1,
      maxFrame: 1,
      update: () => {
        updates += 1;
      },
      render: () => {
        renders += 1;
      },
      now: () => clock
    });

    expect(loop.isRunning()).toBe(false);
    loop.resume();
    expect(loop.isRunning()).toBe(true);
    expect(queuedFrames).toHaveLength(1);

    queuedFrames[0](1100);
    expect(updates).toBe(1);
    expect(renders).toBe(1);

    loop.pause();
    expect(loop.isRunning()).toBe(false);
    expect(canceledFrames).toEqual([2]);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test("fixed step loop clears stale accumulator when restarted", () => {
  const queuedFrames: FrameRequestCallback[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (callback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    let updates = 0;
    let alpha = 0;
    let clock = 0;
    const loop = createFixedStepLoop({
      step: 1,
      maxFrame: 10,
      update: () => {
        updates += 1;
      },
      render: (value) => {
        alpha = value;
      },
      now: () => clock
    });

    loop.start();
    queuedFrames[0](500);
    expect(updates).toBe(0);
    expect(alpha).toBe(0.5);

    loop.stop();
    clock = 500;
    loop.start();
    queuedFrames[2](1000);

    expect(updates).toBe(0);
    expect(alpha).toBe(0.5);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test("fixed step loop runs explicit per-update hooks in order", () => {
  const queuedFrames: FrameRequestCallback[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;

  globalThis.requestAnimationFrame = (callback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    const calls: string[] = [];

    const loop = createFixedStepLoop({
      step: 0.1,
      maxFrame: 1,
      beforeUpdate: () => calls.push("before"),
      update: () => calls.push("update"),
      afterUpdate: () => calls.push("after"),
      render: () => undefined,
      now: () => 0
    });

    loop.start();
    queuedFrames[0](100);

    expect(queuedFrames).toHaveLength(2);
    expect(calls).toEqual(["before", "update", "after"]);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test("fixed step loop rejects timing values that could hang or corrupt interpolation", () => {
  const callbacks = {
    update: () => undefined,
    render: () => undefined
  };

  expect(() => createFixedStepLoop({ ...callbacks, step: 0 })).toThrow("step must be a positive finite number");
  expect(() => createFixedStepLoop({ ...callbacks, step: Number.NaN })).toThrow("step must be a positive finite number");
  expect(() => createFixedStepLoop({ ...callbacks, maxFrame: -1 })).toThrow("maxFrame must be a non-negative finite number");
  expect(() => createFixedStepLoop({ ...callbacks, maxFrame: Number.POSITIVE_INFINITY })).toThrow("maxFrame must be a non-negative finite number");
  expect(() => createFixedStepLoop({ ...callbacks, step: Number.MIN_VALUE, maxFrame: 0.05 })).toThrow("at most 10000 fixed updates");
});

test("fixed step loop stops cleanly when an update callback throws", () => {
  const queuedFrames: FrameRequestCallback[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    let shouldThrow = true;
    let clock = 0;
    const loop = createFixedStepLoop({
      step: 0.1,
      maxFrame: 1,
      update: () => {
        if (shouldThrow) throw new Error("update failed");
      },
      render: () => {},
      now: () => clock
    });

    loop.start();
    expect(() => queuedFrames[0](100)).toThrow("update failed");
    expect(loop.isRunning()).toBe(false);
    expect(queuedFrames).toHaveLength(1);

    shouldThrow = false;
    clock = 100;
    loop.start();
    queuedFrames[1](200);
    expect(loop.isRunning()).toBe(true);
    expect(queuedFrames).toHaveLength(3);
    loop.stop();
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test("fixed step loop does not render or reschedule after a callback stops it", () => {
  const queuedFrames: FrameRequestCallback[] = [];
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    queuedFrames.push(callback);
    return queuedFrames.length;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    let renders = 0;
    let loop: ReturnType<typeof createFixedStepLoop>;
    loop = createFixedStepLoop({
      step: 0.1,
      maxFrame: 1,
      update: () => loop.stop(),
      render: () => { renders += 1; },
      now: () => 0
    });
    loop.start();
    queuedFrames[0](100);

    expect(loop.isRunning()).toBe(false);
    expect(renders).toBe(0);
    expect(queuedFrames).toHaveLength(1);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

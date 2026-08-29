import { expect, test } from "bun:test";
import { createGamepadFixture } from "../test-support/gamepad.ts";
import {
  __setGamepadNavigatorForTests,
  createGamepadActionFrameMapper,
  createGamepadSession,
  createGamepadPoller,
  getGamepad,
  getGamepadAxis,
  getGamepads,
  isGamepadButtonDown,
  isGamepadButtonPressed,
  isGamepadButtonReleased,
  updateGamepads
} from "./gamepad.ts";

function createGamepad(index: number, buttons: boolean[], axes: number[] = [], connected = true) {
  return createGamepadFixture({ index, buttons, axes, connected });
}

test("gamepad polling exposes indexed and any-controller queries", () => {
  __setGamepadNavigatorForTests({
    getGamepads() {
      return [createGamepad(0, [true, false, false, false], [0.1, 0.3]), null];
    }
  });

  updateGamepads();

  expect(getGamepads()).toHaveLength(1);
  expect(getGamepad(0)?.index).toBe(0);
  expect(isGamepadButtonDown(0)).toBe(true);
  expect(isGamepadButtonDown("a", 0)).toBe(true);
  expect(getGamepadAxis("leftx")).toBe(0);
  expect(getGamepadAxis(1, 0)).toBe(0.3);
});

test("gamepad session selects a primary pad and reports button edges", () => {
  let pads: Array<Gamepad | null> = [createGamepadFixture({
    index: 0,
    id: "test-pad",
    axes: [0, 0, 0, 0],
    buttons: [false, true],
  })];
  const session = createGamepadSession({ source: () => pads });
  const first = session.poll();
  expect(first.justConnected).toBe(true);
  expect([...first.pressedButtons]).toEqual([1]);
  expect(session.poll().pressedButtons.size).toBe(0);
  pads = [];
  const disconnected = session.poll();
  expect(disconnected.justDisconnected).toBe(true);
  expect([...disconnected.releasedButtons]).toEqual([1]);
});

test("gamepad poller samples independently from animation frames", () => {
  let polls = 0;
  let scheduled: (() => void) | undefined;
  let cancelled = false;
  const intervalHandle = setInterval(() => {}, 1);
  clearInterval(intervalHandle);
  __setGamepadNavigatorForTests({ getGamepads: () => [] });
  const poller = createGamepadPoller({
    intervalMs: 4,
    now: () => 42,
    onPoll: (time) => { expect(time).toBe(42); polls += 1; },
    schedule(callback) { scheduled = callback; return intervalHandle; },
    cancel() { cancelled = true; },
  });
  poller.start();
  expect(polls).toBe(1);
  scheduled?.();
  expect(polls).toBe(2);
  poller.stop();
  expect(cancelled).toBe(true);
  expect(poller.isRunning()).toBe(false);
});

test("gamepad polling tracks pressed and released edges across frames", () => {
  let pads = [createGamepad(0, [false, false, false, false])];
  __setGamepadNavigatorForTests({
    getGamepads() {
      return pads;
    }
  });

  updateGamepads();
  expect(isGamepadButtonPressed(0)).toBe(false);

  pads = [createGamepad(0, [true, false, false, false])];
  updateGamepads();
  expect(isGamepadButtonDown("a")).toBe(true);
  expect(isGamepadButtonPressed("a")).toBe(true);
  expect(isGamepadButtonReleased("a")).toBe(false);

  pads = [createGamepad(0, [false, false, false, false])];
  updateGamepads();
  expect(isGamepadButtonDown("a")).toBe(false);
  expect(isGamepadButtonPressed("a")).toBe(false);
  expect(isGamepadButtonReleased("a")).toBe(true);
});

test("gamepad polling ignores disconnected and null pads", () => {
  __setGamepadNavigatorForTests({
    getGamepads() {
      return [null, createGamepad(1, [true, false, false, false], [], false), createGamepad(2, [false, true, false, false])];
    }
  });

  updateGamepads();

  expect(getGamepads()).toHaveLength(1);
  expect(getGamepad(1)).toBeNull();
  expect(getGamepad(2)?.index).toBe(2);
  expect(isGamepadButtonDown(1, 2)).toBe(true);
});

test("gamepad action frame mapper normalizes sticks buttons and bindings", () => {
  const mapper = createGamepadActionFrameMapper({
    buttonBindings: [
      { button: "cross", key: "confirm" },
      { button: 6, key: "trigger" }
    ],
    aimRadius: 10,
    defaultMovementDeadzone: 0.1,
    defaultAimDeadzone: 0.2,
    buttonPressThreshold: 0.45
  });

  const frame = mapper.map({
    axes: [0.5, 0, 0.1, -0.8],
    buttons: [{ pressed: true }, {}, {}, {}, {}, {}, { value: 0.5 }],
    connected: true
  });

  expect([...frame.buttons]).toEqual([0, 6]);
  expect([...frame.keys].sort()).toEqual(["confirm", "trigger"]);
  expect(frame.movement.dx).toBeCloseTo(0.444, 3);
  expect(frame.aimOffset?.y).toBeLessThan(-7);
  expect(frame.active).toBe(true);
  expect(mapper.aimOffset({ movement: { dx: 0, dy: 1 } })).toEqual({ x: 0, y: 10 });
});

test("gamepad action frame mapper rejects invalid numeric configuration", () => {
  expect(() => createGamepadActionFrameMapper({ aimRadius: Number.NaN })).toThrow("aimRadius");
  expect(() => createGamepadActionFrameMapper({ maxDeadzone: 1 })).toThrow("maxDeadzone");
  expect(() => createGamepadActionFrameMapper({ buttonPressThreshold: Number.POSITIVE_INFINITY })).toThrow("buttonPressThreshold");
  expect(() => createGamepadActionFrameMapper({ activeEpsilon: -1 })).toThrow("activeEpsilon");
  expect(() => createGamepadActionFrameMapper({ movementAxes: [0, 1.5] })).toThrow("movement axes");
  expect(() => createGamepadActionFrameMapper({ aimAxes: [-1, 2] })).toThrow("aim axes");
});

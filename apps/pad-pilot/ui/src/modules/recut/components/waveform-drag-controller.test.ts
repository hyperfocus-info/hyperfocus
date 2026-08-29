import { expect, it } from "bun:test";
import { createWaveformMarkerDragSession } from "./waveform-drag-controller";

function createTimerHarness() {
  let nextHandle = 1;
  const timers = new Map<number, () => void>();
  return {
    cancelTimer(handle: number) {
      timers.delete(handle);
    },
    fire(handle: number) {
      const callback = timers.get(handle);
      if (!callback) {
        return;
      }
      timers.delete(handle);
      callback();
    },
    lastHandle() {
      return nextHandle - 1;
    },
    scheduleTimer(callback: () => void) {
      const handle = nextHandle;
      nextHandle += 1;
      timers.set(handle, callback);
      return handle;
    },
  };
}

it("waits 250 ms before activating marker drag", () => {
  const timers = createTimerHarness();
  const events: string[] = [];
  const session = createWaveformMarkerDragSession({
    cancelTimer: timers.cancelTimer,
    onActivate: () => {
      events.push("activate");
    },
    onDeactivate: () => {
      events.push("deactivate");
    },
    onMove: () => {
      events.push("move");
    },
    scheduleTimer: timers.scheduleTimer,
    startAltKey: false,
  });

  session.handleMove({ altKey: false, clientX: 420 });
  expect(events).toEqual([]);

  session.dispose();
  expect(events).toEqual([]);
});

it("snaps marker drags to transients by default after activation", () => {
  const timers = createTimerHarness();
  const moves: { clientX: number; snapToTransient: boolean }[] = [];
  const events: string[] = [];
  const session = createWaveformMarkerDragSession({
    cancelTimer: timers.cancelTimer,
    onActivate: () => {
      events.push("activate");
    },
    onDeactivate: () => {
      events.push("deactivate");
    },
    onMove: (move) => {
      moves.push(move);
    },
    scheduleTimer: timers.scheduleTimer,
    startAltKey: false,
  });

  timers.fire(timers.lastHandle());
  session.handleMove({ altKey: false, clientX: 430 });
  session.handleMove({ altKey: false, clientX: 460 });
  session.dispose();

  expect(events).toEqual(["activate", "deactivate"]);
  expect(moves).toEqual([
    { clientX: 430, snapToTransient: true },
    { clientX: 460, snapToTransient: true },
  ]);
});

it("lets Alt disable transient snapping without skipping drag delay", () => {
  const timers = createTimerHarness();
  const moves: { clientX: number; snapToTransient: boolean }[] = [];
  const session = createWaveformMarkerDragSession({
    cancelTimer: timers.cancelTimer,
    onActivate: () => {},
    onDeactivate: () => {},
    onMove: (move) => {
      moves.push(move);
    },
    scheduleTimer: timers.scheduleTimer,
    startAltKey: true,
  });

  session.handleMove({ altKey: true, clientX: 390 });
  expect(moves).toEqual([]);

  timers.fire(timers.lastHandle());
  session.handleMove({ altKey: true, clientX: 430 });
  session.dispose();

  expect(moves).toEqual([{ clientX: 430, snapToTransient: false }]);
});

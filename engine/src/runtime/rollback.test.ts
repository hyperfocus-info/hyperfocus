import { expect, test } from "bun:test";
import { createInputBuffer, createRollbackLoop } from "./rollback.ts";

test("input buffer predicts missing frames and replaces late inputs", () => {
  const buffer = createInputBuffer<number>(4);

  expect(buffer.getFrame(1, ["a", "b"], 0, (peerId) => (peerId === "b" ? -1 : 0))).toEqual({ a: 0, b: -1 });
  expect(buffer.get(1, "b")?.predicted).toBe(true);
  buffer.set(1, "b", 2, false);
  expect(buffer.get(1, "b")).toEqual({ input: 2, predicted: false });
});

test("rollback loop rewinds and re-simulates when late input differs from prediction", () => {
  let state = { x: 0 };
  let rollbacks = 0;
  const loop = createRollbackLoop<number, typeof state>({
    peerIds: ["local", "remote"],
    localPeerId: "local",
    defaultInput: 0,
    getLocalInput: () => 1,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    update: (inputs) => {
      state.x += inputs.local + inputs.remote;
    },
    onRollback: () => {
      rollbacks += 1;
    }
  });

  loop.tick();
  loop.tick();
  expect(state.x).toBe(2);

  loop.receiveInput("remote", 0, 5);

  expect(rollbacks).toBe(1);
  expect(state.x).toBe(7);
  expect(loop.frame()).toBe(2);
});

test("rollback loop reuses historical local inputs during replay", () => {
  let state = { x: 0 };
  const localInputs = [1, 2, 99, 99];
  const loop = createRollbackLoop<number, typeof state>({
    peerIds: ["local", "remote"],
    localPeerId: "local",
    defaultInput: 0,
    getLocalInput: () => localInputs.shift() ?? 99,
    getState: () => state,
    setState: (next) => {
      state = { ...next };
    },
    update: (inputs) => {
      state.x += inputs.local + inputs.remote;
    },
    cloneState: (next) => ({ ...next })
  });

  loop.tick();
  loop.tick();
  expect(state.x).toBe(3);

  loop.receiveInput("remote", 0, 5);

  expect(state.x).toBe(8);
  expect(localInputs).toEqual([99, 99]);
});

test("rollback loop rewinds when an already-real historical input is corrected", () => {
  let state = { x: 0 };
  let rollbacks = 0;
  const loop = createRollbackLoop<number, typeof state>({
    peerIds: ["local", "remote"],
    localPeerId: "local",
    defaultInput: 0,
    getLocalInput: () => 1,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    update: (inputs) => {
      state.x += inputs.local + inputs.remote;
    },
    onRollback: () => {
      rollbacks += 1;
    }
  });

  loop.receiveInput("remote", 0, 2);
  loop.tick();
  loop.tick();
  expect(state.x).toBe(4);

  loop.receiveInput("remote", 0, 5);

  expect(rollbacks).toBe(1);
  expect(state.x).toBe(7);
});

test("rollback loop captures dynamic peer membership per simulated frame", () => {
  let peers = ["local"];
  let state = { seen: [] as string[][] };
  const loop = createRollbackLoop<number, typeof state>({
    peerIds: () => peers,
    localPeerId: "local",
    defaultInput: 0,
    getLocalInput: () => 0,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    update: (inputs) => {
      state.seen.push(Object.keys(inputs).sort());
    }
  });

  loop.tick();
  peers = ["local", "remote"];
  loop.tick();
  peers = ["local"];
  loop.tick();

  expect(state.seen).toEqual([["local"], ["local", "remote"], ["local"]]);
});

test("input buffer can clone predicted defaults for each peer", () => {
  const buffer = createInputBuffer<{ pressed: boolean }>(4);
  const inputs = buffer.getFrame(0, ["a", "b"], { pressed: false }, undefined, (input) => ({ ...input }));

  inputs.a.pressed = true;

  expect(inputs.b.pressed).toBe(false);
  expect(buffer.get(0, "b")?.input.pressed).toBe(false);
});

test("input buffers preserve frames beyond the signed 32-bit boundary", () => {
  const buffer = createInputBuffer<number>(4);
  const frame = 0x80000000;
  buffer.set(frame, "peer", 7);
  expect(buffer.get(frame, "peer")?.input).toBe(7);
});

test("rollback input records safely support prototype-like peer ids", () => {
  const buffer = createInputBuffer<number>(4);
  const inputs = buffer.getFrame(0, ["__proto__", "constructor"], 3);

  expect(Object.keys(inputs).sort()).toEqual(["__proto__", "constructor"]);
  expect(inputs.__proto__).toBe(3);
  expect(Reflect.get(inputs, "constructor")).toBe(3);
});

test("rollback loops ignore inputs outside the retained history and near-future window", () => {
  let state = { x: 0 };
  let rollbacks = 0;
  const loop = createRollbackLoop<number, typeof state>({
    peerIds: ["local", "remote"],
    localPeerId: "local",
    defaultInput: 0,
    maxRollbackFrames: 2,
    getLocalInput: () => 0,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    update: (inputs) => {
      state.x += inputs.remote;
    },
    onRollback: () => rollbacks += 1
  });
  loop.tick();
  loop.tick();
  loop.tick();

  loop.receiveInput("remote", 0, 50);
  loop.receiveInput("remote", 5, 50);
  expect(state.x).toBe(0);
  expect(rollbacks).toBe(0);
  expect(() => loop.receiveInput("remote", Number.NaN, 1)).toThrow("frame");
});

test("rollback history limits reject negative values", () => {
  expect(() => createRollbackLoop({
    peerIds: ["local"],
    localPeerId: "local",
    defaultInput: 0,
    maxRollbackFrames: -1,
    getLocalInput: () => 0,
    getState: () => 0,
    setState: () => undefined,
    update: () => undefined
  })).toThrow("maxRollbackFrames");
  expect(() => createRollbackLoop({
    peerIds: ["local"],
    localPeerId: "local",
    defaultInput: 0,
    maxFutureInputFrames: -1,
    getLocalInput: () => 0,
    getState: () => 0,
    setState: () => undefined,
    update: () => undefined
  })).toThrow("maxFutureInputFrames");
});

test("rollback loops retain bounded early inputs across transport jitter", () => {
  let state = { x: 0 };
  const dropped: Array<[number, string]> = [];
  const loop = createRollbackLoop<number, typeof state>({
    peerIds: ["local", "remote"],
    localPeerId: "local",
    defaultInput: 0,
    maxRollbackFrames: 2,
    maxFutureInputFrames: 3,
    getLocalInput: () => 0,
    getState: () => state,
    setState: (next) => { state = next; },
    update: (inputs) => { state.x += inputs.remote; },
    onInputDropped: (_peerId, frame, reason) => dropped.push([frame, reason])
  });

  loop.receiveInput("remote", 3, 7);
  loop.receiveInput("remote", 4, 9);
  loop.tick();
  loop.tick();
  loop.tick();
  loop.tick();
  expect(state.x).toBe(7);
  expect(dropped).toEqual([[4, "future"]]);

  loop.receiveInput("remote", 0, 1);
  expect(dropped).toEqual([[4, "future"], [0, "history"]]);
});

test("rollback simulation cannot mutate inputs retained for replay", () => {
  let state = { total: 0 };
  const loop = createRollbackLoop<{ amount: number }, typeof state>({
    peerIds: ["local", "remote"],
    localPeerId: "local",
    defaultInput: { amount: 0 },
    getLocalInput: () => ({ amount: 1 }),
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    update: (inputs) => {
      state.total += inputs.local.amount + inputs.remote.amount;
      inputs.local.amount = 100;
    }
  });

  loop.tick();
  loop.tick();
  loop.receiveInput("remote", 0, { amount: 2 });

  expect(state.total).toBe(4);
  expect(loop.inputBuffer.get(0, "local")?.input.amount).toBe(1);
});

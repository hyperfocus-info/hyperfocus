import { expect, test } from "bun:test";
import { createMmoClient, type MmoClientTransport } from "./client.ts";
import type { MmoMappedInput } from "./input.ts";

type TestState = { tick: number };

test("MMO client restores transport subscriptions when reconnecting after close", async () => {
  const snapshotListeners = new Set<(state: TestState) => void>();
  const deltaListeners = new Set<(state: TestState) => void>();
  let connectCount = 0;
  let closeCount = 0;
  const transport: MmoClientTransport<TestState, MmoMappedInput> = {
    async connect() {
      connectCount += 1;
    },
    close() {
      closeCount += 1;
    },
    sendInput() {},
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    onDelta(listener) {
      deltaListeners.add(listener);
      return () => deltaListeners.delete(listener);
    }
  };
  const client = createMmoClient({ transport });
  const received: number[] = [];
  client.onState((state) => received.push(state.tick));

  await client.connect();
  for (const listener of snapshotListeners) listener({ tick: 1 });
  client.close();
  expect(snapshotListeners.size).toBe(0);
  expect(deltaListeners.size).toBe(0);

  await client.connect();
  for (const listener of deltaListeners) listener({ tick: 2 });

  expect(received).toEqual([1, 2]);
  expect(connectCount).toBe(2);
  expect(closeCount).toBe(1);
  expect(snapshotListeners.size).toBe(1);
  expect(deltaListeners.size).toBe(1);
});

test("MMO client does not duplicate subscriptions across repeated connects", async () => {
  const snapshotListeners = new Set<(state: TestState) => void>();
  const transport: MmoClientTransport<TestState, MmoMappedInput> = {
    async connect() {},
    close() {},
    sendInput() {},
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    }
  };
  const client = createMmoClient({ transport });

  await client.connect();
  await client.connect();

  expect(snapshotListeners.size).toBe(1);
});

test("MMO client rolls back a partial transport subscription", () => {
  const snapshotListeners = new Set<(state: TestState) => void>();
  const transport: MmoClientTransport<TestState, MmoMappedInput> = {
    async connect() {},
    close() {},
    sendInput() {},
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    onDelta() {
      throw new Error("delta subscription failed");
    }
  };

  expect(() => createMmoClient({ transport })).toThrow("delta subscription failed");
  expect(snapshotListeners.size).toBe(0);
});

test("MMO client completes listener and transport cleanup when one callback throws", () => {
  const snapshotListeners = new Set<(state: TestState) => void>();
  const deltaListeners = new Set<(state: TestState) => void>();
  let closed = false;
  const transport: MmoClientTransport<TestState, MmoMappedInput> = {
    async connect() {},
    close() { closed = true; },
    sendInput() {},
    onSnapshot(listener) {
      snapshotListeners.add(listener);
      return () => {
        snapshotListeners.delete(listener);
        throw new Error("snapshot cleanup failed");
      };
    },
    onDelta(listener) {
      deltaListeners.add(listener);
      return () => deltaListeners.delete(listener);
    }
  };
  const client = createMmoClient({ transport });

  expect(() => client.close()).toThrow("snapshot cleanup failed");
  expect(snapshotListeners.size).toBe(0);
  expect(deltaListeners.size).toBe(0);
  expect(closed).toBe(true);
});

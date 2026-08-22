import { expect, test } from "bun:test";
import { decodeThreeArenaBinaryState, decodeThreeArenaBinaryStateHeader, encodeThreeArenaBinaryState } from "./binary-state.ts";

test("three arena binary state encodes a complete header with entity counts", () => {
  const bytes = encodeThreeArenaBinaryState({
    type: "state",
    roomId: "bench-room",
    status: "waiting",
    hostId: "player-1",
    seed: 1234,
    startedAt: 0,
    createdAt: 123456000,
    tick: 42,
    time: 123456789,
    players: [
      {
        id: "player-1",
        name: "Rin",
        classId: "warden",
        weapons: [{ id: "pistol", level: 3, evolved: false }],
        passives: [{ id: "boots", level: 2, effects: ["team-speed"] }],
        x: 1,
        y: 2,
        vx: 3,
        vy: 4,
        angle: 0.5,
        shooting: true,
        alive: true,
        lastSeen: 123456700,
      },
      {
        id: "player-2",
        name: "Sol",
        classId: null,
        weapons: [],
        passives: [],
        x: -1,
        y: -2,
        vx: 0,
        vy: 0,
        angle: 1,
        shooting: false,
        alive: true,
        lastSeen: 123456710,
      },
    ],
    shots: [
      {
        id: "shot-1",
        ownerId: "player-1",
        x: 10,
        y: 20,
        vx: 30,
        vy: 40,
        angle: 0.25,
        createdAt: 123456720,
        ttl: 1400,
      },
    ],
  });

  expect(decodeThreeArenaBinaryStateHeader(bytes)).toEqual({
    tick: 42,
    time: 123456789,
    roomId: "bench-room",
    players: 2,
    shots: 1,
  });
  expect(decodeThreeArenaBinaryState(bytes).players[0]!.passives).toEqual([
    { id: "boots", level: 2, effects: ["team-speed"] }
  ]);
});

test("three arena binary state rejects non-state frames", () => {
  expect(() => decodeThreeArenaBinaryStateHeader(new Uint8Array([0, 1, 2, 3]))).toThrow();
});

import { describe, expect, test } from "bun:test";
import { PARTICLE_INSTANCE_STRIDE, createParticleEmitter2D, createTimeline, createTimelinePlayer } from "./index.ts";

describe("deterministic timeline primitives", () => {
  test("samples linear, step, and smooth tracks into caller-owned storage", () => {
    const clip = createTimeline({ duration: 2, tracks: [
      { id: "x", keyframes: [{ time: 0, value: 0 }, { time: 2, value: 10 }] },
      { id: "visible", keyframes: [{ time: 0, value: 1, easing: "step" }, { time: 1, value: 0 }] },
      { id: "alpha", keyframes: [{ time: 0, value: 0, easing: "smoothstep" }, { time: 2, value: 1 }] },
    ] });
    const output = new Float64Array(3);
    expect(clip.sample(1, output)).toBe(output);
    expect([...output]).toEqual([5, 0, 0.5]);
  });

  test("repeats, ping-pongs, emits crossed events, and restores snapshots", () => {
    const clip = createTimeline({ duration: 1, loop: "ping-pong", tracks: [{ id: "x", keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }], events: [{ time: 0.25, id: "quarter" }, { time: 0.75, id: "three-quarter" }] });
    const player = createTimelinePlayer(clip);
    const values = new Float64Array(1);
    const events: string[] = [];
    expect(player.advance(0.8, values, events)).toMatchObject({ time: 0.8, direction: 1, eventsWritten: 2 });
    expect(events).toEqual(["quarter", "three-quarter"]);
    events.length = 0;
    const reversed = player.advance(0.6, values, events);
    expect(reversed).toMatchObject({ direction: -1, loops: 1 });
    expect(reversed.time).toBeCloseTo(0.6);
    expect(events).toEqual(["three-quarter"]);
    const restored = createTimelinePlayer(clip, player.snapshot());
    expect(restored.snapshot()).toEqual(player.snapshot());
  });

  test("rejects malformed bounds and duplicate tracks", () => {
    expect(() => createTimeline({ duration: 0, tracks: [] })).toThrow(/duration/);
    expect(() => createTimeline({ duration: 1, tracks: [{ id: "x", keyframes: [{ time: 0.5, value: 1 }, { time: 0.5, value: 2 }] }] })).toThrow(/unique/);
    expect(() => createTimeline({ duration: 1, tracks: [{ id: "x", keyframes: [{ time: 0, value: 1 }] }, { id: "x", keyframes: [{ time: 0, value: 2 }] }] })).toThrow(/Duplicate/);
  });
});

describe("fixed-capacity particle primitives", () => {
  test("emits, advances, expires, and writes stable caller-owned instances", () => {
    const emitter = createParticleEmitter2D({ capacity: 3, seed: 7, lifetimeMin: 1, lifetimeMax: 1, speedMin: 10, speedMax: 10, angleMin: 0, angleMax: 0, sizeMin: 2, sizeMax: 2 });
    expect(emitter.emit(2, 1, 2)).toBe(2);
    emitter.step(0.25);
    emitter.step(0.25);
    const output = new Float32Array(3 * PARTICLE_INSTANCE_STRIDE);
    expect(emitter.writeInstances(output)).toBe(2);
    expect([...output.slice(0, 4)]).toEqual([6, 2, 0.5, 2]);
    emitter.step(0.25);
    emitter.step(0.25);
    expect(emitter.count).toBe(0);
    expect(emitter.diagnostics.expired).toBe(2);
  });

  test("is byte-deterministic and reports capacity drops", () => {
    const run = () => {
      const emitter = createParticleEmitter2D({ capacity: 2, seed: 42, lifetimeMin: 2, lifetimeMax: 2 });
      emitter.emit(2);
      emitter.emit(1);
      emitter.step(0.1);
      const output = new Float32Array(8);
      emitter.writeInstances(output);
      return { output: new Uint8Array(output.buffer), snapshot: emitter.snapshot() };
    };
    expect(run()).toEqual(run());
    expect(run().snapshot.diagnostics.dropped).toBe(1);
  });

  test("validates capacities, ranges, deltas, and emit budgets", () => {
    expect(() => createParticleEmitter2D({ capacity: 0 })).toThrow(/capacity/);
    expect(() => createParticleEmitter2D({ capacity: 2, lifetimeMin: 2, lifetimeMax: 1 })).toThrow(/maximums/);
    const emitter = createParticleEmitter2D({ capacity: 2, maxEmitPerCall: 1 });
    expect(() => emitter.emit(2)).toThrow(/emit count/);
    expect(() => emitter.step(0.5)).toThrow(/at most/);
    expect(emitter.numericStorageBytes).toBe(66);
  });
});

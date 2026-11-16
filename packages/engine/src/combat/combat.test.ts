import { describe, expect, test } from "bun:test";
import { createCombatPreset } from "./config.ts";
import { readCombatConfig } from "./read.ts";
import { createCombatSimulation } from "./simulation.ts";

const fighters = [
  { id: "a", position: { x: 0, y: 0, z: 0 } },
  { id: "b", position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
];

describe("portable combat", () => {
  test("startup, active contacts, one hit per target, and physics impulse", () => {
    const sim = createCombatSimulation({ fighters });
    expect(sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }] })).toEqual([]);
    for (let frame = 1; frame < 4; frame++) expect(sim.step()).toEqual([]);
    expect(sim.step()).toMatchObject([{ kind: "hit", damage: 8, impulse: { x: 2, y: 0, z: 0 } }]);
    for (let frame = 5; frame < 20; frame++) expect(sim.step()).toEqual([]);
    expect(sim.inspect().fighters.find((fighter) => fighter.id === "b")?.health).toBe(92);
  });
  test("simultaneous attacks trade independent of registration order", () => {
    const first = createCombatSimulation({ fighters });
    const second = createCombatSimulation({ fighters: [...fighters].reverse() });
    const inputs = fighters.map((fighter) => ({ fighterId: fighter.id, pressed: ["jab"] }));
    first.step({ inputs }); second.step({ inputs: [...inputs].reverse() });
    for (let frame = 1; frame < 4; frame++) { first.step(); second.step(); }
    const events = first.step();
    expect(events).toHaveLength(2);
    expect(second.step()).toEqual(events);
    expect(first.capture()).toEqual(second.capture());
  });
  test("rollback restores buffered inputs and stable event identities", () => {
    const sim = createCombatSimulation({ fighters });
    sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }] });
    const checkpoint = sim.capture();
    const run = () => Array.from({ length: 20 }, () => sim.step()).flat();
    const events = run(); const result = sim.capture();
    sim.restore({ snapshot: checkpoint });
    expect(run()).toEqual(events); expect(sim.capture()).toEqual(result);
    checkpoint.fighters[0]!.health = 1;
    expect(sim.capture()).toEqual(result);
  });
  test("fresh guard parries, held guard blocks, attacks from behind bypass guard", () => {
    for (const expected of ["parry", "block", "hit"] as const) {
      const sim = createCombatSimulation({ fighters });
      sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }, { fighterId: "b", guard: expected === "block" }] });
      for (let frame = 1; frame < 4; frame++) sim.step({ inputs: [{ fighterId: "b", guard: expected === "block" }] });
      const events = sim.step({ inputs: [{ fighterId: "b", guard: true }],
        poses: expected === "hit" ? [{ fighterId: "b", position: { x: 1, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } }] : [] });
      expect(events[0]?.kind).toBe(expected);
    }
  });
  test("custom contacts override spheres and buffered cancel starts the next move", () => {
    const sim = createCombatSimulation({ fighters });
    sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }] });
    for (let frame = 1; frame < 6; frame++) expect(sim.step({ contacts: [] })).toEqual([]);
    sim.step({ inputs: [{ fighterId: "a", pressed: ["heavy"] }], contacts: [] });
    expect(sim.inspect().fighters[0]?.moveId).toBe("jab");
    sim.step({ contacts: [] });
    expect(sim.inspect().fighters[0]?.moveId).toBe("heavy");
  });
  test("long commands take priority and invalid authored tuning is rejected", () => {
    const config = createCombatPreset();
    config.moves[1]!.command = ["forward", "jab"];
    const sim = createCombatSimulation({ fighters, config });
    sim.step({ inputs: [{ fighterId: "a", pressed: ["forward"] }] });
    sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }] });
    expect(sim.inspect().fighters[0]?.moveId).toBe("heavy");
    expect(() => readCombatConfig({ ...config, parryFrames: -1 })).toThrow();
    expect(() => readCombatConfig({ ...config, moves: [{ ...config.moves[0], hitRadius: NaN }] })).toThrow();
    expect(() => readCombatConfig(null)).toThrow();
    const altered = createCombatPreset(); altered.maxHealth = 200;
    expect(() => createCombatSimulation({ fighters, config: altered }).restore({ snapshot: sim.capture() })).toThrow();
  });
  test("guard continues through blockstun but cannot cancel hitstun", () => {
    const config = createCombatPreset(); config.parryFrames = 0;
    const third = { id: "c", position: { x: 0, y: 0, z: 0 } };
    for (const guarded of [true, false]) {
      const sim = createCombatSimulation({ fighters: [...fighters, third], config });
      sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }, { fighterId: "b", guard: guarded }], contacts: [] });
      sim.step({ inputs: [{ fighterId: "c", pressed: ["jab"] }, { fighterId: "b", guard: guarded }], contacts: [] });
      for (let frame = 2; frame < 4; frame++) sim.step({ inputs: [{ fighterId: "b", guard: guarded }], contacts: [] });
      expect(sim.step({ inputs: [{ fighterId: "b", guard: guarded }], contacts: [{ attackerId: "a", targetId: "b" }] })[0]?.kind).toBe(guarded ? "block" : "hit");
      expect(sim.step({ inputs: [{ fighterId: "b", guard: true }], contacts: [{ attackerId: "c", targetId: "b" }] })[0]?.kind).toBe(guarded ? "block" : "hit");
    }
  });
  test("expired queued inputs do not start after recovery", () => {
    const config = createCombatPreset();
    for (const move of config.moves) move.cancels = [];
    const sim = createCombatSimulation({ fighters, config });
    sim.step({ inputs: [{ fighterId: "a", pressed: ["heavy"] }], contacts: [] });
    sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }], contacts: [] });
    for (let frame = 2; frame < 40; frame++) sim.step({ contacts: [] });
    expect(sim.inspect().fighters[0]?.moveId).toBe("");
    expect(sim.inspect().fighters[0]?.attackSerial).toBe(1);
  });
  test("malformed persisted snapshots reject atomically", () => {
    const sim = createCombatSimulation({ fighters });
    const before = sim.capture();
    expect(() => sim.restore({ snapshot: null })).toThrow();
    expect(() => sim.restore({ snapshot: { ...before, fighters: [{ ...before.fighters[0], history: null }] } })).toThrow();
    expect(() => sim.restore({ snapshot: { ...before, fighters: before.fighters.map((fighter) => ({ ...fighter, attackSerial: 5 })) } })).toThrow();
    expect(sim.capture()).toEqual(before);
    sim.restore({ snapshot: JSON.parse(JSON.stringify(before)) });
    expect(sim.capture()).toEqual(before);
  });
});

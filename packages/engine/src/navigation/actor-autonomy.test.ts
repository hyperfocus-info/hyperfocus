import { expect, test } from "bun:test";
import { createActorAutonomy, type AutonomousActor, type ActorPerception } from "../actors/autonomy.ts";
import { chooseActorAction } from "./actor-choice.ts";

const empty: ActorPerception = { threats: [], resources: [], exits: [] };
test('continuous spawns preserve authored placement and reject overlapping bodies', () => {
  const world = createActorAutonomy({ columns: 4, rows: 4, seed: 0, actors: [{ id: 'a', cell: 5, position: { x: 1.2, y: 1.4 }, facing: 1.2 }] });
  expect(world.snapshot().actors[0]).toMatchObject({ x: 1.2, y: 1.4, facing: 1.2 });
  expect(() => createActorAutonomy({ columns: 4, rows: 4, seed: 0, actors: [{ id: 'a', cell: 5, position: { x: 1.9, y: 1.5 } }, { id: 'b', cell: 6, position: { x: 2.1, y: 1.5 } }] })).toThrow('overlap');
  expect(() => createActorAutonomy({ columns: 4, rows: 4, seed: 0, actors: [{ id: 'a', cell: 5, position: { x: 2.2, y: 1.5 } }] })).toThrow('position');
});
function advance(world: ReturnType<typeof createActorAutonomy>, perception: ActorPerception, ticks = 600) {
  const trace = [world.snapshot()];
  for (let i = 0; i < ticks; i++) trace.push(world.step(perception));
  return trace;
}

test("thirst selects a reachable drinking point, rejecting nearer sealed water", () => {
  const blocked = new Uint8Array(70);
  for (const cell of [2, 11, 13, 22]) blocked[cell] = 1;
  const world = createActorAutonomy({ columns: 10, rows: 7, seed: 7, blocked, actors: [{ id: "animal", cell: 10, thirst: 1 }] });
  const trace = advance(world, { ...empty, resources: [{ id: "sealed", cell: 12 }, { id: "shore", cell: 48 }] });
  expect(trace.some(s => s.actors[0]!.target === "shore")).toBe(true);
  expect(trace.some(s => s.actors[0]!.target === "sealed")).toBe(false);
  expect(trace.at(-1)!.actors[0]!.thirst).toBeLessThan(0.11);
  expect(trace.some(s => s.actors[0]!.poseIntent === "drink")).toBe(true);
});

test("crowd uses wall opening, helper accepts risk, no overlaps or wall entries", () => {
  const blocked = new Uint8Array(120);
  for (let y = 0; y < 10; y++) if (y !== 5 && y !== 6) blocked[y * 12 + 6] = 1;
  const actors: AutonomousActor[] = [
    { id: "helper", cell: 62, helping: 1, preservation: 0.05 },
    { id: "hurt", cell: 39, endangered: true },
    { id: "a", cell: 50 }, { id: "b", cell: 74 }, { id: "c", cell: 99 },
  ];
  const world = createActorAutonomy({ columns: 12, rows: 10, seed: 4, blocked, actors });
  const trace = advance(world, { ...empty, threats: [{ id: "danger", cell: 13, strength: 1 }], exits: [23, 47, 71, 95, 119].map(cell => ({ id: `exit-${cell}`, cell })) }, 900);
  expect(trace.some(s => s.actors.find(a => a.id === "helper")!.action === "assist")).toBe(true);
  expect(trace.at(-1)!.actors.find(a => a.id === "hurt")!.assisted).toBe(false);
  const initial = trace[0]!.actors.find(a => a.id === "helper")!;
  const initialRiskDistance = Math.hypot(initial.x - 1.5, initial.y - 1.5);
  expect(trace.some(s => {
    const helper = s.actors.find(a => a.id === "helper")!;
    return helper.action === "assist" && Math.hypot(helper.x - 1.5, helper.y - 1.5) < initialRiskDistance - 0.5;
  })).toBe(true);
  for (const id of ["a", "b", "c"]) expect(trace.some(s => s.actors.find(a => a.id === id)!.x > 7)).toBe(true);
  for (const s of trace) for (const a of s.actors) {
    expect(blocked[Math.floor(a.y) * 12 + Math.floor(a.x)]).toBe(0);
    for (const b of s.actors) if (a.id !== b.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(0.699999);
  }
});

test("closing route replans around adverse geometry without teleporting", () => {
  const world = createActorAutonomy({ columns: 7, rows: 5, seed: 2, actors: [{ id: "a", cell: 14, thirst: 1 }] });
  const p = { ...empty, resources: [{ id: "water", cell: 20 }] };
  const before = world.step(p);
  world.setBlocked(17, true);
  const trace = [before, ...advance(world, p)];
  expect(trace.at(-1)!.actors[0]!.thirst).toBeLessThan(0.11);
  expect(trace.some(s => s.actors[0]!.y !== 2.5)).toBe(true);
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1]!.actors[0]!, b = trace[i]!.actors[0]!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(0.06666666766666667);
  }
});

test("same seed and shuffled actor/perception arrays yield identical traces", () => {
  const actors = [{ id: "a", cell: 0, thirst: 1 }, { id: "b", cell: 8, thirst: 1 }];
  const resources = [{ id: "left", cell: 20 }, { id: "right", cell: 24 }];
  const run = (reverse: boolean) => advance(createActorAutonomy({ columns: 5, rows: 5, seed: 72,
    actors: reverse ? [...actors].reverse() : actors }), { ...empty, resources: reverse ? [...resources].reverse() : resources }, 100);
  expect(run(false)).toEqual(run(false));
  expect(run(true)).toEqual(run(false));
});

test("sealed corridor deadlock waits safely without claiming progress", () => {
  const world = createActorAutonomy({ columns: 5, rows: 1, seed: 1, actors: [{ id: "a", cell: 0, thirst: 1 }, { id: "hurt", cell: 2, endangered: true }] });
  const trace = advance(world, { ...empty, resources: [{ id: "water", cell: 4 }] }, 120);
  expect(trace.at(-1)!.actors[0]!.cell).toBe(0);
  expect(trace.at(-1)!.actors[0]!.contact).toStartWith("waiting:");
  expect(trace.at(-1)!.actors[0]!.thirst).toBe(1);
});

test("rejects overlapping spawns, unsafe dt, invalid traits and wall insertion", () => {
  expect(() => createActorAutonomy({ columns: 2, rows: 2, seed: 1, fixedDt: NaN, actors: [] })).toThrow();
  expect(() => createActorAutonomy({ columns: 2, rows: 2, seed: 1, actors: [{ id: "a", cell: 0, helping: 2 }] })).toThrow();
  expect(() => createActorAutonomy({ columns: 2, rows: 2, seed: 1, actors: [{ id: "a", cell: 0 }, { id: "b", cell: 0 }] })).toThrow();
  const world = createActorAutonomy({ columns: 2, rows: 2, seed: 1, actors: [{ id: "a", cell: 0 }] });
  expect(() => world.setBlocked(0, true)).toThrow();
});

test("commitment holds an ongoing action; hysteresis resists near ties after expiry", () => {
  const drink = { action: "drink" as const, id: "water", cell: 2, cost: 2, safety: 0 };
  const flee = { action: "flee" as const, id: "exit", cell: 3, cost: 2, safety: 0 };
  const options = { thirst: 0.5, danger: 0.1, helping: 0, preservation: 1, opportunities: [drink, flee],
    committed: false, hysteresis: 0.15, tie: () => 0 };
  const current = chooseActorAction(options);
  expect(current.action).toBe("drink");
  expect(chooseActorAction({ ...options, current, thirst: 0.1, danger: 0.5, committed: true }).action).toBe("drink");
  expect(chooseActorAction({ ...options, current, thirst: 0.1, danger: 0.5 }).action).toBe("flee");
  const tied = { ...options, current, thirst: 0.2, danger: 0.2 };
  expect(chooseActorAction(tied).action).toBe("drink");
  expect(chooseActorAction({ ...tied, hysteresis: 0 }).action).toBe("flee");
});

test("acute perceived danger interrupts a committed drink", () => {
  const world = createActorAutonomy({ columns: 6, rows: 2, seed: 10, actors: [{ id: "animal", cell: 0, thirst: 1 }] });
  expect(world.step({ ...empty, resources: [{ id: "water", cell: 2 }] }).actors[0]!.action).toBe("drink");
  expect(world.step({ resources: [{ id: "water", cell: 2 }], threats: [{ id: "danger", cell: 0, strength: 1 }],
    exits: [{ id: "exit", cell: 11 }] }).actors[0]!.action).toBe("flee");
});

test("help requires host support; injury persists and interruption stops unsupported travel", () => {
  const w = createActorAutonomy({ columns: 12, rows: 4, seed: 19, actors: [
    { id: "helper", cell: 13, helping: 1, preservation: .02 }, { id: "hurt", cell: 14, endangered: true },
  ] });
  const p = { ...empty, threats: [{ id: "danger", cell: 12, strength: 1 }], exits: [{ id: "safe", cell: 23 }] };
  for (let i = 0; i < 20; i++) w.step(p);
  expect(w.snapshot().actors[1]!.assisted).toBe(false);
  const before = w.snapshot();
  for (let i = 0; i < 600; i++) w.step({ ...p, supports: [{ helper: "helper", recipient: "hurt" }] });
  const after = w.snapshot();
  expect(after.actors.every(a => a.x > 9)).toBe(true);
  expect(after.actors[1]!.endangered).toBe(true);
  expect(after.actors[1]!.assisted).toBe(true);
  expect(after.actors[1]!.x).toBeGreaterThan(before.actors[1]!.x);
  const pos = after.actors[1]!.x;
  for (let i = 0; i < 30; i++) w.step(p);
  expect(w.snapshot().actors[1]!.supportBy).toBeNull();
  expect(w.snapshot().actors[1]!.x).toBe(pos);
});

test("unconfirmed help expires into escape, reaction delay is deterministic", () => {
  const w = createActorAutonomy({ columns: 10, rows: 4, seed: 33, actors: [
    { id: "helper", cell: 11, helping: 1, preservation: .01, reactionSeconds: .5 },
    { id: "hurt", cell: 12, endangered: true },
  ] });
  const p = { ...empty, threats: [{ id: "danger", cell: 10, strength: 1 }], exits: [{ id: "safe", cell: 39 }] };
  for (let i = 0; i < 15; i++) expect(w.step(p).actors[0]!.x).toBe(1.5);
  const trace = advance(w, p, 600);
  expect(trace.some(f => f.actors[0]!.contact === "support:awaiting-host")).toBe(true);
  expect(trace.at(-1)!.actors[0]!.x).toBeGreaterThan(8);
  expect(trace.at(-1)!.actors[1]!.endangered).toBe(true);
});

test("contact actually pushes, remains bounded, never overlaps across a crowded doorway", () => {
  const blocked = new Uint8Array(80);
  for (let y = 0; y < 8; y++) if (y !== 3) blocked[y * 10 + 5] = 1;
  const w = createActorAutonomy({ columns: 10, rows: 8, seed: 9, blocked, actors: [
    { id: "a", cell: 31, speed: 3 }, { id: "b", cell: 32, speed: .7 }, { id: "c", cell: 23, speed: 1 },
  ] });
  const trace = advance(w, { ...empty, threats: [{ id: "danger", cell: 30, strength: 1 }], exits: [19,39,59].map(cell => ({ id: String(cell), cell })) }, 600);
  expect(trace.some(f => f.actors.some(a => a.contact.startsWith("body:")))).toBe(true);
  for (let i = 1; i < trace.length; i++) for (const a of trace[i]!.actors) {
    const old = trace[i - 1]!.actors.find(b => b.id === a.id)!;
    expect(Math.hypot(a.x - old.x, a.y - old.y)).toBeLessThanOrEqual(0.11666667666666666);
    for (const b of trace[i]!.actors) if (b.id !== a.id) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(0.6999999899999999);
    expect(blocked[a.cell]).toBe(0);
  }
});

test("a delayed neighbour is physically displaced by bounded contact, not random motion", () => {
  const w = createActorAutonomy({ columns: 8, rows: 1, seed: 77, actors: [
    { id: "a", cell: 0, speed: 3 }, { id: "b", cell: 1, speed: .5, reactionSeconds: 100 },
  ] });
  const trace = advance(w, { ...empty, threats: [{ id: "danger", cell: 0, strength: 1 }], exits: [{ id: "safe", cell: 7 }] }, 90);
  expect(trace.some(f => f.actors[0]!.contact === "body:b")).toBe(true);
  expect(trace.at(-1)!.actors[1]!.x).toBeGreaterThan(1.6);
  for (let i = 1; i < trace.length; i++) expect(Math.abs(trace[i]!.actors[1]!.x - trace[i - 1]!.actors[1]!.x)).toBeLessThanOrEqual(0.033333343333333335);
});

test("decision diagnostics capture needs before host tie callbacks run", () => {
  const options = { thirst: .5, danger: .2, helping: 0, preservation: 1,
    opportunities: [0, 1].map(cell => ({ action: "drink" as const, id: String(cell), cell, cost: 0, safety: 0 })),
    committed: false, hysteresis: .15, tie: (_id: string) => { options.thirst = .9; return 0; } };
  expect(chooseActorAction(options).reason).toBe("drink:thirst=0.500,danger=0.200,route=0");
});

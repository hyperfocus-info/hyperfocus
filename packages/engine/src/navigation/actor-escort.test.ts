import { expect, test } from "bun:test";
import { createActorAutonomy } from "../actors/autonomy";
import school from "./actor-school.fixture.json";
const p = { threats: [{ id: "danger", cell: 0, strength: 1 }], resources: [], exits: [{ id: "exit", cell: 7, safeCells: [6, 7] }] };
const links = [{ helper: "helper", recipient: "hurt" }];
function pair(speed = 2, reactionSeconds = 0) {
  return createActorAutonomy({ columns: 8, rows: 1, seed: 1, actors: [{ id: "helper", cell: 0, helping: 1, preservation: .01, speed }, { id: "hurt", cell: 1, endangered: true, speed: 10, reactionSeconds }] });
}
test("occupied exit preserves flee intent while awaiting explicit clearance", () => {
  const w = createActorAutonomy({ columns: 8, rows: 1, seed: 1, actors: [{ id: "a", cell: 0 }, { id: "b", cell: 2 }] });
  for (let i = 0; i < 600; i++) w.step({ ...p, exits: [{ id: "exit", cell: 7 }] });
  expect(w.snapshot().actors.every(a => a.action === "flee")).toBe(true);
});
test("pair corridor has distinct safe slots by 20 seconds without retreat", () => {
  const w = pair(); let last = 0;
  for (let i = 0; i < 600; i++) { const f = w.step({ ...p, supports: i ? links : [] }); const hurt = f.actors[1]!; expect(hurt.x + 1e-8).toBeGreaterThanOrEqual(last); last = hurt.x; }
  expect(w.snapshot().actors.every(a => a.cell >= 6 && a.arrived)).toBe(true);
});
test("range break is symmetric and shared travel respects slower member", () => {
  const w = pair(.1);
  for (let i = 0; i < 90; i++) {
    const old = w.snapshot(); const f = w.step({ ...p, supports: i ? links : [] });
    const [h, r] = f.actors; expect(h!.supportTo === r!.id).toBe(r!.supportBy === h!.id);
    expect(Math.hypot(h!.x - r!.x, h!.y - r!.y)).toBeLessThanOrEqual(1.2);
    expect(Math.abs(r!.x - old.actors[1]!.x)).toBeLessThanOrEqual(0.0033333433333333335);
  }
  const x = w.snapshot().actors[1]!.x; for (let i = 0; i < 90; i++)w.step(p);
  expect(w.snapshot().actors[1]!.x).toBe(x); expect(w.snapshot().actors[1]!.endangered).toBe(true);
});
test("reaction delay does not veto externally supported walking", () => {
  const w = pair(2, 100); for (let i = 0; i < 600; i++)w.step({ ...p, supports: i ? links : [] });
  expect(w.snapshot().actors.every(a => a.cell >= 6 && a.arrived)).toBe(true);
});
test("school at 30s has arrival or an explicit blocked outcome, independent of input order", () => {
  const run = (reverse: boolean) => { const w = createActorAutonomy({ ...school.geometry, blocked: new Uint8Array(school.geometry.blocked), seed: school.seed, actors: reverse ? [...school.actors].reverse() : school.actors, perceptionRadius: 20 }); for (let i = 0; i < 900; i++)w.step(school.perception); return w.snapshot(); };
  const f = run(false); expect(run(true)).toEqual(f);
  for (const a of f.actors.filter(a => !a.endangered)) expect(school.perception.exits.some(e => e.cell === a.cell) || ("blockedReason" in a && !!a.blockedReason)).toBe(true);
});
test("three actor queue drains only through explicit arrival clearance", () => {
  const w = createActorAutonomy({ columns: 8, rows: 1, seed: 4, actors: [{ id: "a", cell: 0 }, { id: "b", cell: 2 }, { id: "c", cell: 4 }] });
  const seen = new Set<string>();
  for (let i = 0; i < 600; i++) {
    const f = w.step({ ...p, exits: [{ id: "exit", cell: 7 }] });
    for (const a of f.actors) {
      if (!a.cleared) expect(a.action).toBe("flee");
      if (a.arrived && !a.cleared) { seen.add(a.id); w.clearArrival(a.id); }
    }
  }
  expect([...seen].sort()).toEqual(["a", "b", "c"]);
  expect(w.snapshot().actors.every(a => a.cleared)).toBe(true);
  expect(() => pair().clearArrival("helper")).toThrow();
});
test("confirmation loss stops travel immediately and approach failure expires within two seconds", () => {
  const w = pair(); for (let i = 0; i < 20; i++)w.step({ ...p, supports: i ? links : [] });
  const x = w.snapshot().actors[1]!.x;
  const first = w.step(p); expect(first.actors.every(a => !a.supportBy && !a.supportTo)).toBe(true);
  for (let i = 0; i < 61; i++) w.step(p);
  expect(w.snapshot().actors[1]!.x).toBe(x);
  expect(w.snapshot().actors[0]!.action).toBe("flee");
});
test("route searches are retained across unchanged substeps", () => {
  const w = createActorAutonomy({ columns: 20, rows: 1, seed: 1, actors: [{ id: "a", cell: 0 }] });
  for (let i = 0; i < 600; i++)w.step({ ...p, exits: [{ id: "exit", cell: 19 }] });
  expect(w.snapshot().searches).toBeLessThanOrEqual(40);
});
test("school explicit exit lifecycle clears all nine mobile actors by 30 seconds", () => {
  const w = createActorAutonomy({ ...school.geometry, blocked: new Uint8Array(school.geometry.blocked), seed: school.seed, actors: school.actors, perceptionRadius: 20 });
  for (let i = 0; i < 900; i++) {
    const f = w.step(school.perception);
    for (const a of f.actors) if (a.arrived && !a.cleared) w.clearArrival(a.id);
  }
  expect(w.snapshot().actors.filter(a => !a.endangered && a.cleared)).toHaveLength(9);
  expect(w.snapshot().searches).toBeLessThan(1000);
  expect(w.snapshot().actors.find(a => a.endangered)!.cell).toBe(66);
});

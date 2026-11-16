import { expect, test } from "bun:test";
import { createCombatSimulation } from "@hyperfocus/engine/combat";
import { createTouchOfDeathPreset } from "./preset.ts";
import { readCombatConfig } from "@hyperfocus/engine/combat";

const fighters = [
  { id: "a", position: { x: 0, y: 0, z: 0 } },
  { id: "b", position: { x: 1, y: 0, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
];
const flurryStartup = createTouchOfDeathPreset().moves.find(move => move.id === 'flurry')!.startupFrames;
const jabStartup = createTouchOfDeathPreset().moves.find(move => move.id === 'jab')!.startupFrames;
test('back heavy advances with light armor; heavy hits crush it in either seat, escape remains armored', () => {
  const config = createTouchOfDeathPreset(), kick = config.moves.find(move => move.id === 'heavy-away')!;
  config.moves.push({ ...config.moves.find(move => move.id === 'heavy')!, id: 'weapon-staff-heavy', command: ['weapon-staff-heavy'] });
  expect(kick).toMatchObject({ movementAngle: 0, armorFrames: 21, verticalImpulse: 0, reach: 1.5 });
  for (const seat of [0, 1]) for (const attackId of ['jab', 'heavy', 'weapon-staff-heavy']) for (const defenseId of ['heavy-away', 'escape']) {
    const sim = createCombatSimulation({ fighters, config }), state = sim.capture();
    const target = state.fighters[seat]!, attacker = state.fighters[1 - seat]!;
    Object.assign(target, { moveId: defenseId, moveFrame: 2, armorFrames: 18 });
    Object.assign(attacker, { moveId: attackId, moveFrame: config.moves.find(move => move.id === attackId)!.startupFrames });
    sim.restore({ snapshot: state }); const event = sim.step()[0]!;
    const after = sim.inspect().fighters[seat]!;
    expect(after.health).toBeLessThan(100);
    if (attackId !== 'jab' && defenseId === 'heavy-away') {
      expect(after.moveId).toBe(''); expect(after.stunFrames).toBeGreaterThan(0); expect(after.armorFrames).toBe(0);
      expect(event.impulse.y).toBeGreaterThan(0);
    } else {
      expect(after.moveId).toBe(defenseId); expect(after.stunFrames).toBe(0); expect(event.impulse).toEqual({ x: 0, y: 0, z: 0 });
    }
  }
});
function practice() { return createCombatSimulation({ fighters, config: createTouchOfDeathPreset() }); }
test('back heavy uses ordinary directional input and loses armor before recovery', () => {
  const sim = practice();
  sim.step({ inputs: [{ fighterId: 'a', pressed: ['heavy'], direction: { x: -1, y: 0, z: 0 } }] });
  expect(sim.inspect().fighters[0]).toMatchObject({ moveId: 'heavy-away', armorFrames: 21, escapeCharges: 1 });
  for (let i = 0; i < 21; i++) sim.step();
  expect(sim.inspect().fighters[0]).toMatchObject({ moveId: 'heavy-away', armorFrames: 0, escapeCharges: 1 });
});
test('grounded recoil uses defender physics, independent of attacker input, and preserves unreported hosts', () => {
  for (const airborne of [undefined, false, true]) {
    const config = createTouchOfDeathPreset();
    expect(readCombatConfig(config)).toEqual(config);
    const sim = createCombatSimulation({ fighters, config });
    for (let frame = 0; frame <= flurryStartup; frame++) sim.step({
      inputs: [{ fighterId: 'a', airborne: !airborne, drive: true, pressed: frame === 0 ? ['jab'] : [] }],
      poses: [{ fighterId: 'b', position: fighters[1]!.position, airborne }],
    });
    expect(sim.inspect().fighters[1]!.stunFrames).toBe(airborne === false ? 35 : 65);
  }
  const config = createTouchOfDeathPreset();
  config.moves[0]!.groundedHitstunFrames = -1;
  expect(() => readCombatConfig(config)).toThrow();
});
test('repeated Drive-only strings run short of stamina and offer recovery before a kill', () => {
  for (const command of ['jab', 'flurry']) {
    const sim = practice();
    let damaged = false, gap = false;
    for (let frame = 0; frame < 300; frame++) {
      sim.step({ inputs: [{ fighterId: 'a', drive: true, pressed: frame % 8 === 0 ? [command] : [] }], poses: [{ fighterId: 'b', position: fighters[1]!.position, airborne: false }] });
      const defender = sim.inspect().fighters[1]!;
      damaged ||= defender.health < 100;
      gap ||= damaged && defender.health > 0 && defender.stunFrames === 0;
      if (!defender.health || gap) break;
    }
    expect(gap, command).toBe(true);expect(sim.inspect().fighters[1]!.health).toBeGreaterThan(0);
    const delayed = practice();delayed.step({ inputs: [{ fighterId: 'a', drive: true, pressed: [command] }], poses: [{ fighterId: 'b', position: fighters[1]!.position, airborne: false }] });
    for (let frame = 0; frame < 100; frame++) delayed.step({ poses: [{ fighterId: 'b', position: fighters[1]!.position, airborne: false }] });
    expect(delayed.inspect().fighters[1]!).toMatchObject({ stunFrames: 0, health: 84 });
  }
});
function launch(sim: ReturnType<typeof practice>) {
  sim.step({ inputs: [{ fighterId: "a", pressed: ["heavy"] }] });
  for (let i = 0; i < 27; i++) sim.step();
  const event = sim.step()[0]!;
  expect(event).toMatchObject({ kind: "hit", damage: 24 });
  expect(event.impulse.y).toBeCloseTo(8.821538461538461);
}

test('guard wear persists through inactivity; only a successful parry restores a capped configurable quarter', () => {
  for (const restore of [undefined, 0, .25, .5]) {
    const config = createTouchOfDeathPreset();
    if (restore === undefined) delete config.parryGuardRestore;
    else config.parryGuardRestore = restore;
    expect(readCombatConfig(config)).toEqual(config);
    const sim = createCombatSimulation({ fighters, config });
    const saved = sim.capture(); saved.fighters[1]!.guardMeter = 80;
    sim.restore({ snapshot: saved });
    for (let tick = 0; tick < 660; tick++) sim.step();
    expect(sim.inspect().fighters[1]!.guardMeter).toBe(80);
    sim.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }] });
    for (let tick = 1; tick < jabStartup; tick++) sim.step();
    const before = sim.capture();
    const inputs = [{ fighterId: 'b', guard: true }];
    expect(sim.step({ inputs })[0]?.kind).toBe('parry');
    expect(sim.inspect().fighters[1]!.guardMeter).toBe(Math.min(100, 80 + 100 * (restore ?? .25)));
    const after = sim.capture(); sim.restore({ snapshot: before }); sim.step({ inputs });
    expect(sim.capture()).toEqual(after);
  }
  for (const invalid of [-1, 1.01, NaN]) expect(() => readCombatConfig({ ...createTouchOfDeathPreset(), parryGuardRestore: invalid })).toThrow();
});

test("release/repress parries the next strike during visible block recoil", () => {
  const sim = practice();
  sim.step({ inputs: [{ fighterId: "a", pressed: ["flurry"] }, { fighterId: "b", guard: true }] });
  for (let i = 1; i < flurryStartup; i++) sim.step({ inputs: [{ fighterId: "b", guard: true }] });
  expect(sim.step({ inputs: [{ fighterId: "b", guard: true }] })[0]?.kind).toBe("block");
  expect(sim.inspect().fighters[1]?.stunKind).toBe("block");
  for (let i = flurryStartup + 1; i < flurryStartup + 6; i++) sim.step({ inputs: [{ fighterId: "b", guard: false }] });
  expect(sim.step({ inputs: [{ fighterId: "b", guard: true }] })[0]?.kind).toBe("parry");
  expect(sim.inspect().fighters[0]).toMatchObject({ moveId: '', stunKind: 'parry', stunFrames: 20 });
  expect(sim.inspect().fighters[1]).toMatchObject({ moveId: '', stunFrames: 0, followupFrames: 24 });
  sim.step({ inputs: [{ fighterId: "b", pressed: ["followup"] }] });
  expect(sim.inspect().fighters[1]?.moveId).toBe("followup");
});

test("guard break disables guard and parry for exactly 600 subsequent ticks; chip cannot kill", () => {
  const config = createTouchOfDeathPreset(); config.maxGuard = 1;
  config.parryFrames = 0; // This fixture exercises held block, independent of the parry window.
  const sim = createCombatSimulation({ fighters, config });
  const state = sim.capture(); const defender = state.fighters[1];
  if (!defender) throw new Error("missing defender");
  defender.health = 2; sim.restore({ snapshot: state });
  sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }, { fighterId: "b", guard: true }] });
  for (let i = 1; i < jabStartup; i++) sim.step({ inputs: [{ fighterId: "b", guard: true }] });
  expect(sim.step({ inputs: [{ fighterId: "b", guard: true }] })[0]?.kind).toBe("guard-break");
  expect(sim.inspect().fighters[1]).toMatchObject({ health: 1, guardBrokenFrames: 600 });
  for (let i = 0; i < 599; i++) sim.step({ contacts: [] });
  expect(sim.inspect().fighters[1]?.guardBrokenFrames).toBe(1);
  sim.step({ contacts: [] });
  expect(sim.inspect().fighters[1]).toMatchObject({ guardBrokenFrames: 0, guardMeter: 1 });
});

test("armored escape interrupts hitstun once, absorbs damage without interruption, and can die", () => {
  const sim = practice(); launch(sim);
  sim.step({ inputs: [{ fighterId: "b", pressed: ["escape"] }] });
  expect(sim.inspect().fighters[1]).toMatchObject({ escapeCharges: 0, stunFrames: 0, moveId: "escape", armorFrames: 20 });
  const state = sim.capture(); const attacker = state.fighters[0]; const defender = state.fighters[1];
  if (!attacker || !defender) throw new Error("missing fighters");
  attacker.moveId = "jab"; attacker.moveFrame = jabStartup; attacker.hitTargets = []; attacker.strikeIndex = -1;
  sim.restore({ snapshot: state });
  expect(sim.step()[0]?.kind).toBe("hit");
  expect(sim.inspect().fighters[1]).toMatchObject({ health: 68, moveId: "escape", stunFrames: 0 });
  const lethal = sim.capture(); const low = lethal.fighters[1]; const attack = lethal.fighters[0];
  if (!low || !attack) throw new Error("missing fighters");
  low.health = 1; attack.hitTargets = []; sim.restore({ snapshot: lethal }); sim.step();
  expect(sim.inspect().fighters[1]?.health).toBe(0);
});

test("free collision tech consumes one timing window, protects recovery, and early mashing fails", () => {
  const collision = { fighterId: "b", normal: { x: 0, y: 1, z: 0 }, contactPoint: { x: 1, y: -.6, z: 0 } };
  const sim = practice(); launch(sim);
  const before = sim.capture();
  const input = { fighterId: "b", tech: true, direction: { x: 0, y: 0, z: 1 } };
  const events = sim.step({ inputs: [input], collisions: [collision] });
  expect(events[0]).toMatchObject({ kind: "tech", impulse: { z: 6 } });
  expect(events[0]?.contactPoint).toEqual(collision.contactPoint);
  expect(events[0]?.contactNormal).toEqual(collision.normal);
  const after = sim.capture(); sim.restore({ snapshot: before });
  expect(sim.step({ inputs: [input], collisions: [collision] })).toEqual(events);
  expect(sim.capture()).toEqual(after);
  expect(after.fighters[1]).toMatchObject({ stunFrames: 0, protectionFrames: 12, escapeCharges: 1 });
  const protectedState = sim.capture();
  protectedState.fighters[0]!.moveId = 'flurry'; protectedState.fighters[0]!.moveFrame = flurryStartup;
  protectedState.fighters[0]!.hitTargets = []; protectedState.fighters[0]!.strikeIndex = -1;
  sim.restore({ snapshot: protectedState });
  for (let frame = 0; frame < 11; frame++) expect(sim.step().filter(event => event.kind === 'hit')).toHaveLength(0);
  expect(sim.inspect().fighters[1]!.stunFrames).toBe(0);
  sim.restore({ snapshot: before }); sim.step({ inputs: [input] });
  for (let i = 0; i < 11; i++) sim.step({ inputs: [{ fighterId: "b", tech: i % 2 === 0 }] });
  expect(sim.step({ inputs: [input], collisions: [collision] })[0]?.kind).toBe("bounce");
});

test("earned launcher and committed continuations kill within stamina; late continuation drops", () => {
  const sim = practice(); launch(sim);
  const config = createTouchOfDeathPreset(), heavy = config.moves.find(move => move.id === 'heavy')!, flurry = config.moves.find(move => move.id === 'flurry')!, linked = config.moves.find(move => move.id === 'drive-jab-link')!, finisher = config.moves.find(move => move.id === 'drive-heavy')!;
  const first = heavy.startupFrames + heavy.activeFrames + heavy.recoveryFrames;
  const second = first + flurry.cancels.find(window => window.moveId === linked.id)!.fromFrame;
  const third = second + linked.cancels.find(window => window.moveId === finisher.id)!.fromFrame;
  const fourth = third + finisher.startupFrames + finisher.activeFrames + finisher.recoveryFrames;
  for (let frame = heavy.startupFrames + 1; frame < first; frame++) sim.step();
  const checkpoint = sim.capture();
  const run = () => {
    const events = [];
    for (let frame = first; frame < fourth + 44; frame++) {
      events.push(...sim.step({ inputs: [{ fighterId: "a", airborne: true, drive: frame < fourth, pressed: [first, second, fourth, fourth + 17].includes(frame) ? ["jab"] : frame === third ? ["heavy"] : [] }] }));
      if ((sim.inspect().fighters[1]?.health ?? 0) > 0) expect(sim.inspect().fighters[1]?.stunKind).toBe("hit");
    }
    return events;
  };
  const events = run(); expect(sim.inspect().fighters[1]?.health).toBe(0);
  expect(sim.inspect().fighters[0]?.stamina).toBeGreaterThanOrEqual(0);
  sim.restore({ snapshot: checkpoint }); expect(run()).toEqual(events);
  sim.restore({ snapshot: checkpoint });
  for (let i = 0; i < checkpoint.fighters[1]!.stunFrames; i++) sim.step();
  expect(sim.inspect().fighters[1]?.stunFrames).toBe(0);
});

test("simultaneous chip stays nonlethal and guard break cannot parry", () => {
  const config = createTouchOfDeathPreset();
  config.parryFrames = 0;
  const sim = createCombatSimulation({ config, fighters: [...fighters, { id: "c", position: { x: 0, y: 0, z: 0 } }] });
  const state = sim.capture(); const defender = state.fighters[1];
  if (!defender) throw new Error("missing defender");
  defender.health = 2; sim.restore({ snapshot: state });
  sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }, { fighterId: "c", pressed: ["jab"] }, { fighterId: "b", guard: true }] });
  for (let i = 1; i < jabStartup; i++) sim.step({ inputs: [{ fighterId: "b", guard: true }] });
  const events = sim.step({ inputs: [{ fighterId: "b", guard: true }] });
  expect(events.filter((event) => event.targetId === "b")).toHaveLength(2);
  expect(sim.inspect().fighters[1]?.health).toBe(1);
  const broken = practice(); const snapshot = broken.capture(); const guard = snapshot.fighters[1];
  if (!guard) throw new Error("missing defender");
  guard.guardBrokenFrames = 600; guard.guardMeter = 0; broken.restore({ snapshot });
  broken.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }] });
  for (let i = 1; i < jabStartup; i++) broken.step();
  expect(broken.step({ inputs: [{ fighterId: "b", guard: true }] })[0]?.kind).toBe("hit");
});

test("ordinary attacks and unlinked specials cannot interrupt commitment or hitstun", () => {
  const sim = practice();
  sim.step({ inputs: [{ fighterId: "a", pressed: ["heavy"] }] });
  sim.step({ inputs: [{ fighterId: "a", pressed: ["jab"] }] });
  expect(sim.inspect().fighters[0]?.moveId).toBe("heavy");
  sim.step({ inputs: [{ fighterId: "a", pressed: ["evade"] }] });
  expect(sim.inspect().fighters[0]?.moveId).toBe("heavy");
  const launched = practice(); launch(launched);
  launched.step({ inputs: [{ fighterId: "b", pressed: ["evade"], guard: true }] });
  expect(launched.inspect().fighters[1]).toMatchObject({ moveId: "", stunKind: "hit" });
});

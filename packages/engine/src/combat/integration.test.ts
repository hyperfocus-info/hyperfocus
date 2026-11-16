import { expect, test } from "bun:test";
import { createRigidWorld3D } from "../physics/rigid-3d.ts";
import { createRollbackParticipant } from "../runtime/combat-rollback/checkpoint.ts";
import { createCombatRollbackSession } from "../runtime/combat-rollback/session.ts";
import { createCombatSimulation } from "./simulation.ts";
import type { CombatEvent } from "./state.ts";

function fixture(history = 20) {
  const world = createRigidWorld3D({ capacity: 3, gravityY: -9.81 });
  world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 10, halfY: .5, halfZ: 10 }, y: -.5 });
  world.addBody({ id: "local", shape: { kind: "sphere", radius: .5 }, x: 0, y: .5 });
  world.addBody({ id: "remote", shape: { kind: "sphere", radius: .5 }, x: 1, y: .5 });
  const combat = createCombatSimulation({ fighters: [
    { id: "local", position: { x: 0, y: .5, z: 0 } },
    { id: "remote", position: { x: 1, y: .5, z: 0 }, facing: { x: -1, y: 0, z: 0 } },
  ] });
  const confirmed: CombatEvent[] = [];
  const session = createCombatRollbackSession<string[], CombatEvent>({
    peerIds: ["local", "remote"], localPeerId: "local", defaultInput: [], getLocalInput: () => [],
    maxRollbackFrames: history, predictInput: () => [],
    participants: [
      createRollbackParticipant({ id: "combat", capture: combat.capture, restore: (snapshot) => combat.restore({ snapshot }) }),
      createRollbackParticipant({ id: "physics", capture: world.checkpoint, restore: world.restoreCheckpoint }),
    ],
    update({ inputs, step, emit }) {
      const poses = ["local", "remote"].map((fighterId) => {
        const body = world.body(fighterId);
        if (!body) throw new Error("missing fixture body");
        return { fighterId, position: { x: body.x, y: body.y, z: body.z } };
      });
      for (const event of combat.step({ inputs: Object.entries(inputs).map(([fighterId, pressed]) => ({ fighterId, pressed })), poses })) {
        world.applyImpulse(event.targetId, event.impulse.x, event.impulse.y, event.impulse.z);
        emit(event.id, event); emit(event.id, event);
      }
      world.step(step);
    },
    onConfirmedEvent: ({ event }) => confirmed.push(event),
  });
  return { combat, world, session, confirmed };
}

test("real combat and rigid contacts converge after late attack input without duplicate effects", () => {
  const timely = fixture(), late = fixture();
  for (let frame = 0; frame < 10; frame++) {
    timely.session.receiveInput("remote", frame, frame === 0 ? ["jab"] : []);
    timely.session.tick(); late.session.tick();
  }
  expect(late.confirmed).toEqual([]);
  expect(timely.confirmed).toHaveLength(1);
  expect(timely.combat.capture().fighters.find((fighter) => fighter.id === "local")?.health).toBe(92);
  expect(timely.world.body("local")?.x).toBeLessThan(0);
  for (let frame = 9; frame >= 0; frame--) late.session.receiveInput("remote", frame, frame === 0 ? ["jab"] : []);
  expect(late.combat.capture()).toEqual(timely.combat.capture());
  expect(late.world.checkpoint()).toEqual(timely.world.checkpoint());
  expect(late.session.stateHash(9)).toBe(timely.session.stateHash(9));
  expect(late.confirmed).toEqual(timely.confirmed);
  late.session.receiveInput("remote", 0, ["heavy"]);
  expect(late.confirmed).toHaveLength(1);
});

test("integrated rollback stops before losing physics history and resumes on confirmation", () => {
  const { session, combat, world } = fixture(2);
  session.tick(); session.tick();
  const before = { combat: combat.capture(), world: world.checkpoint() };
  expect(() => session.tick()).toThrow("history exhausted");
  expect({ combat: combat.capture(), world: world.checkpoint() }).toEqual(before);
  session.receiveInput("remote", 0, ["jab"]);
  expect(() => session.tick()).not.toThrow();
  expect(session.frame()).toBe(3);
});

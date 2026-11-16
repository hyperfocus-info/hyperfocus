import { expect, test } from "bun:test";
import { createRollbackParticipant, hashRollbackState } from "./checkpoint.ts";
import { createCombatRollbackSession } from "./session.ts";
import { createRigidWorld3D } from "../../physics/rigid-3d.ts";

function fixture(history = 120) {
  let combat = { health: 100 };
  let physics = { velocity: new Float64Array([0]), position: 0 };
  const delivered: string[] = [];
  const session = createCombatRollbackSession<number, string>({
    peerIds: ["local", "remote"], localPeerId: "local", defaultInput: 0,
    getLocalInput: () => 0, maxRollbackFrames: history,
    participants: [
      createRollbackParticipant({ id: "combat", capture: () => combat, restore: (state) => { combat = state; } }),
      createRollbackParticipant({ id: "physics", capture: () => physics, restore: (state) => { physics = state; } })
    ],
    update({ inputs, frame, emit }) {
      physics.velocity[0] += inputs.remote;
      physics.position += physics.velocity[0];
      if (inputs.remote > 0) {
        combat.health -= inputs.remote;
        emit("hit", `hit-${frame}`);
        emit("hit", `hit-${frame}`);
      }
    },
    onConfirmedEvent: ({ event }) => delivered.push(event)
  });
  return { session, delivered, state: () => ({ combat, physics }) };
}

test("late input restores all participants and converges with on-time simulation", () => {
  const timely = fixture();
  const late = fixture();
  for (let frame = 0; frame < 4; frame += 1) {
    timely.session.receiveInput("remote", frame, frame + 1);
    timely.session.tick();
    late.session.tick();
  }
  expect(late.delivered).toEqual([]);
  late.session.receiveInput("remote", 3, 4);
  late.session.receiveInput("remote", 1, 2);
  late.session.receiveInput("remote", 0, 1);
  late.session.receiveInput("remote", 2, 3);
  expect(late.state()).toEqual(timely.state());
  expect(late.session.stateHash(3)).toBe(timely.session.stateHash(3));
  expect(late.delivered).toEqual(["hit-0", "hit-1", "hit-2", "hit-3"]);
  late.session.receiveInput("remote", 0, 99);
  expect(late.state()).toEqual(timely.state());
  expect(late.delivered).toHaveLength(4);
});

test("history exhaustion stalls until missing input arrives", () => {
  const { session } = fixture(2);
  session.tick(); session.tick();
  expect(() => session.tick()).toThrow("history exhausted");
  session.receiveInput("remote", 0, 0);
  expect(() => session.tick()).not.toThrow();
  expect(session.confirmedFrame()).toBe(0);
});

test("hashes reject unsupported state and compare only retained confirmed frames", () => {
  expect(hashRollbackState({ state: { a: 1, b: 2 } })).toBe(hashRollbackState({ state: { b: 2, a: 1 } }));
  expect(() => hashRollbackState({ state: new Map() })).toThrow("plain objects");
  expect(() => hashRollbackState({ state: { health: NaN } })).toThrow("finite");
  expect(() => hashRollbackState({ state: new Float32Array([NaN]) })).toThrow("finite");
  const { session } = fixture(1);
  session.tick();
  expect(session.compareStateHash({ frame: 0, hash: "bad" })).toBe("unavailable");
  session.receiveInput("remote", 0, 0);
  expect(session.compareStateHash({ frame: 0, hash: "bad" })).toBe("desync");
  session.receiveInput("remote", 1, 0);
  session.tick();
  expect(session.stateHash(0)).toBeUndefined();
});

test("rigid world checkpoints replay impulses and contact solver state", () => {
  function create() {
    const world = createRigidWorld3D({ capacity: 2, gravityY: -9.81 });
    world.addBody({ id: "floor", type: "static", shape: { kind: "box", halfX: 5, halfY: .5, halfZ: 5 }, y: -.5 });
    world.addBody({ id: "fighter", shape: { kind: "sphere", radius: .5 }, y: .5 });
    const session = createCombatRollbackSession({
      peerIds: ["local", "remote"], localPeerId: "local", defaultInput: 0, getLocalInput: () => 0,
      participants: [createRollbackParticipant({ id: "world", capture: world.checkpoint, restore: world.restoreCheckpoint })],
      update({ inputs, step }) {
        world.applyImpulse("fighter", inputs.remote, 0, 0);
        world.step(step);
      }
    });
    return { world, session };
  }
  const timely = create(), late = create();
  for (let frame = 0; frame < 6; frame += 1) {
    timely.session.receiveInput("remote", frame, frame === 1 ? 3 : 0);
    timely.session.tick(); late.session.tick();
  }
  for (let frame = 5; frame >= 0; frame -= 1) late.session.receiveInput("remote", frame, frame === 1 ? 3 : 0);
  expect(late.world.checkpoint()).toEqual(timely.world.checkpoint());
  expect(late.session.stateHash(5)).toBe(timely.session.stateHash(5));
});

test("confirmation removes speculative effects and rejects foreign or local-peer corrections", () => {
  let state = 0;
  const effects: number[] = [];
  const session = createCombatRollbackSession<number, number>({
    peerIds: ["local", "remote"], localPeerId: "local", defaultInput: 0, getLocalInput: () => 1,
    participants: [createRollbackParticipant({ id: "state", capture: () => state, restore: (value) => { state = value; } })],
    update({ inputs, emit }) { state += inputs.local + inputs.remote; emit("effect", inputs.remote); },
    onConfirmedEvent: ({ event }) => effects.push(event)
  });
  session.tick(); session.tick();
  session.receiveInput("unknown", 0, 99);
  session.receiveInput("local", 0, 99);
  expect(state).toBe(2);
  expect(() => session.receiveInput("remote", -1, 99)).toThrow("frame");
  session.receiveInput("remote", 1, 3);
  session.receiveInput("remote", 1, 4);
  expect(effects).toEqual([]);
  session.receiveInput("remote", 0, 2);
  expect(state).toBe(8);
  expect(effects).toEqual([2, 4]);
});

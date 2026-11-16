import { atan2, cos, hypot, sin } from '../../../math/simulation.ts';
import { createRigidWorld3D, type RigidBodyState3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DRuntime } from '../../runtime-3d.ts';
import type { CombatEvent, CombatSnapshot } from '../../../combat/state.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { poseCombatLimb } from '../combat-visuals/effects.ts';
import { requireRecord } from '@hyperfocus/utilities/records';
import { requireText } from '@hyperfocus/utilities/text';
import { requireArray, requireNumber } from '@hyperfocus/utilities/validation';

type Part = { name: string; parent: string; point: [number, number, number]; radius: number };
const parts: Part[] = [{ name: 'head', parent: 'torso', point: [0, .72, 0], radius: .24 }];
for (const side of [-1, 1]) {
  const name = side < 0 ? 'left' : 'right';
  parts.push({ name: `${name}-elbow`, parent: 'torso', point: [side * .45, .05, .1], radius: .12 },
    { name: `${name}-hand`, parent: `${name}-elbow`, point: [side * .48, -.22, .25], radius: .145 },
    { name: `${name}-knee`, parent: 'torso', point: [side * .18, -.53, .06], radius: .13 },
    { name: `${name}-boot`, parent: `${name}-knee`, point: [side * .18, -.8, .08], radius: .16 });
}
type SavedBody = { id: string; pose: number[] };
type SavedRig = { id: string; bodies: SavedBody[] };

export function readCombatKnockoutState3D(value: unknown): SavedRig[] {
  return requireArray(value).map(value => { const row = requireRecord(value);return { ...row, id: requireText(row.id), bodies: requireArray(row.bodies).map(value => { const body = requireRecord(value);return { ...body, id: requireText(body.id), pose: requireArray(body.pose).map(value => requireNumber(value)) }; }) }; });
}

/** Ten physical bodies per corpse, isolated from the host's fixed checkpoint topology. */
export function createCombatKnockout3D(options: { runtime: Hyperfocus3DRuntime; fighterIds: readonly string[] }) {
  const { runtime, fighterIds } = options;
  const scene = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!;
  const colliders = scene.entities.filter(entity => entity.physics && !fighterIds.includes(entity.id));
  const createWorld = () => createRigidWorld3D({ capacity: Math.max(32, colliders.length + fighterIds.length * 10), maxConstraints: fighterIds.length * 20, gravityY: -26, constraintIterations: 12 });
  let world = createWorld();
  let retainedTopology = false;
  const active = new Set<string>();
  const originalMasks = new Map(fighterIds.map(id => [id, runtime.physics.body(id)!.collisionMask]));
  function populate() { for (const entity of colliders) {
    const body = runtime.physics.body(entity.id)!;
    world.addBody({ id: entity.id, type: 'static', shape: body.shape, x: body.x, y: body.y, z: body.z, rotation: rotation(body), collisionMask: body.collisionMask ? 2 : 0, friction: .7, restitution: .16 });
  }
  }
  populate();
  const key = (id: string, part: string) => `${id}:ko:${part}`;
  function addRig(id: string) {
    const host = runtime.physics.body(id)!;
    const yaw = atan2(2 * host.rotationY * host.rotationW, 1 - 2 * host.rotationY ** 2);
    const definitions: Part[] = [{ name: 'torso', parent: '', point: [0, 0, 0], radius: .3 }, ...parts];
    for (const part of definitions) {
      const [x, y, z] = part.point;
      world.addBody({ id: key(id, part.name), type: 'dynamic', shape: part.name === 'torso' ? { kind: 'box', halfX: .29, halfY: .36, halfZ: .22 } : { kind: 'sphere', radius: part.radius },
        x: host.x + x * cos(yaw) + z * sin(yaw), y: host.y + y, z: host.z - x * sin(yaw) + z * cos(yaw),
        velocityX: host.velocityX, velocityY: host.velocityY, velocityZ: host.velocityZ, mass: part.name === 'torso' ? .45 : .061111,
        rotation: rotation(host), angularVelocity: [1.4, 0, -.7], continuous: true, collisionLayer: 2, collisionMask: 1, friction: .65, restitution: .2, angularDamping: 2, linearDamping: .4 });
    }
    for (const part of parts) {
      const parent = definitions.find(item => item.name === part.parent)!;
      const anchor = part.parent === 'torso' ? part.name === 'head' ? [0, .36, 0] : part.name.endsWith('elbow') ? [Math.sign(part.point[0]) * .28, .3, 0] : [Math.sign(part.point[0]) * .16, -.3, 0] : [0, 0, 0];
      world.addPointConstraint({ id: key(id, part.name), a: key(id, part.parent), b: key(id, part.name), localAnchorA: anchor,
        localAnchorB: [parent.point[0] + anchor[0]! - part.point[0], parent.point[1] + anchor[1]! - part.point[1], parent.point[2] + anchor[2]! - part.point[2]], stiffness: .8, damping: .3, maxImpulse: 8 });
      world.addAngularLimitConstraint({ id: key(id, `${part.name}:limit`), a: key(id, part.parent), b: key(id, part.name), maxAngleRadians: part.name === 'head' ? .65 : 1.8, maxTorqueImpulse: .06 });
    }
  }
  function add(id: string) {
    if (active.has(id)) return;
    if (retainedTopology) {
      // A rollback closure still owns the old topology. Copy its complete solver
      // state into an identically constructed world before extending that world.
      const saved = world.checkpoint();
      world = createWorld();populate();
      for (const existing of active) addRig(existing);
      world.restoreCheckpoint(saved);retainedTopology = false;
    }
    addRig(id);active.add(id);
    runtime.physics.configureBody(id, { collisionMask: 0 });
  }
  function reset() {
    for (const id of active) {
      runtime.physics.configureBody(id, { collisionMask: originalMasks.get(id)! });
    }
    active.clear();
    world = createWorld();populate();retainedTopology = false;
  }
  function synchronize() {
    for (const id of active) {
      const torso = world.body(key(id, 'torso'))!;
      runtime.applyCommands({ commands: [{ type: 'teleport', entityId: id, position: [torso.x, torso.y, torso.z] }] });
      runtime.physics.setVelocity(id, 0, 0, 0);
    }
  }
  return {
    reset,
    /** Detached counters from the current world, including after reset/restore. */
    diagnostics: () => ({ ...world.diagnostics }),
    /** Local rollback only. Restore the host runtime/physics AFTER this participant. */
    checkpoint() {
      retainedTopology = true;
      const owner = world, physics = world.checkpoint(), ids = [...active];
      return {
        state: { active: ids, physics },
        restore() {
          world = owner;world.restoreCheckpoint(physics);retainedTopology = true;
          active.clear();for (const id of ids) active.add(id);
          for (const id of fighterIds) runtime.physics.configureBody(id, { collisionMask: active.has(id) ? 0 : originalMasks.get(id)! });
          synchronize();
        },
      };
    },
    has(id: string) { return active.has(id); },
    capture(): SavedRig[] { return [...active].map(id => ({ id, bodies: ['torso', ...parts.map(part => part.name)].map(part => { const body = world.body(key(id, part))!;return { id: part, pose: [body.x, body.y, body.z, ...rotation(body), body.velocityX, body.velocityY, body.velocityZ, body.angularVelocityX, body.angularVelocityY, body.angularVelocityZ] }; }) })); },
    validate(value: unknown): SavedRig[] {
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.length > fighterIds.length || new Set(value.map(rig => rig?.id)).size !== value.length) throw new Error('Invalid saved knockout rigs.');
      for (const rig of value) {
        if (!rig || !fighterIds.includes(rig.id) || !Array.isArray(rig.bodies) || rig.bodies.length !== 10) throw new Error('Invalid saved knockout rig.');
        for (const [index, name] of ['torso', ...parts.map(part => part.name)].entries()) {
          const body = rig.bodies[index];
          if (body?.id !== name || !Array.isArray(body.pose) || body.pose.length !== 13 || body.pose.some((number: unknown) => typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 1e6) || Math.abs(hypot(...body.pose.slice(3, 7)) - 1) > .001) throw new Error('Invalid saved knockout body.');
        }
      }
      return readCombatKnockoutState3D(value);
    },
    restore(rigs: SavedRig[]) {
      reset();
      for (const rig of rigs) {
        add(rig.id);
        for (const body of rig.bodies) {
          const p = body.pose, id = key(rig.id, body.id);
          world.setPosition(id, p[0]!, p[1]!, p[2]!);world.setRotation(id, p[3]!, p[4]!, p[5]!, p[6]!);
          world.setVelocity(id, p[7]!, p[8]!, p[9]!);world.setAngularVelocity(id, p[10]!, p[11]!, p[12]!);
        }
      }
      synchronize();
    },
    step(state: CombatSnapshot, events: readonly CombatEvent[]) {
      for (const fighter of state.fighters) if (fighter.health <= 0) add(fighter.id);
      if (!active.size) return;
      for (const entity of colliders) {
        const body = runtime.physics.body(entity.id)!;
      world.setPosition(entity.id, body.x, body.y, body.z);world.setRotation(entity.id, ...rotation(body));
      world.configureBody(entity.id, { collisionMask: body.collisionMask ? 2 : 0 });
      }
      for (const event of events) if (active.has(event.targetId) && event.kind === 'hit' && event.defenseReason !== 'out-of-bounds') {
        // Distribute contact momentum through the body chain; torso torque makes the impact tumble.
        const torso = world.body(key(event.targetId, 'torso'))!;
        // A dead body stays available for a follow-up: lights pop it back up, launchers lift higher.
        // This is corpse-only presentation physics; living launch trajectories remain authored combat data.
        const lift = Math.max(0, Math.min(14, Math.max(6, event.impulse.y)) - torso.velocityY);
        for (const part of ['torso', ...parts.map(part => part.name)]) {
          const body = world.body(key(event.targetId, part))!;
          world.applyImpulse(body.id, event.impulse.x * body.mass * .45, lift * body.mass, event.impulse.z * body.mass * .45);
        }
        world.applyTorqueImpulse(key(event.targetId, 'torso'), .05 + event.impulse.z * .025, 0, -event.impulse.x * .025);
      }
      world.step(0.016666666666666666);synchronize();
    },
    present(frame: Hyperfocus3DEvaluatedFrame) {
      for (const id of active) {
        const point = (part: string): [number, number, number] => { const body = world.body(key(id, part))!;return [body.x, body.y, body.z]; };
        const torso = world.body(key(id, 'torso'))!, root = frame.entities.find(entity => entity.id === id);
        if (root) { root.position = point('torso');root.rotation = rotation(torso);root.scale = [1, 1, 1]; }
        for (const name of ['head', 'left-hand', 'right-hand', 'left-boot', 'right-boot']) {
          const entity = frame.entities.find(entity => entity.id === `${id}:${name}`), body = world.body(key(id, name))!;
          if (entity) { entity.position = point(name);entity.rotation = rotation(body); }
        }
        for (const side of ['left', 'right']) for (const [name, from, to, width] of [['arm', 'torso', `${side}-elbow`, .2], ['forearm', `${side}-elbow`, `${side}-hand`, .18], ['thigh', 'torso', `${side}-knee`, .22], ['shin', `${side}-knee`, `${side}-boot`, .18]] as const) {
          const entity = frame.entities.find(entity => entity.id === `${id}:${side}-${name}`);
          const sign = side === 'left' ? -1 : 1;
          const anchor = from === 'torso' ? localPoint(torso, name === 'arm' ? [sign * .28, .3, 0] : [sign * .16, -.3, 0]) : point(from);
          if (entity) poseCombatLimb(entity, anchor, point(to), width);
        }
        for (const [name, parent, offset] of [['hair', 'head', [0, .25, -.02]], ['face', 'head', [0, .02, .22]], ['belt', 'torso', [0, -.17, 0]]] as const) {
          const entity = frame.entities.find(entity => entity.id === `${id}:${name}`);
          const body = world.body(key(id, parent))!;
          if (entity) { entity.position = localPoint(body, offset);entity.rotation = rotation(body);entity.visible = true; }
        }
        const guard = frame.entities.find(entity => entity.id === `${id}:guard-shell`);if (guard) guard.visible = false;
      }
    },
  };
}
function rotation(body: RigidBodyState3D): [number, number, number, number] { return [body.rotationX, body.rotationY, body.rotationZ, body.rotationW]; }
function localPoint(body: RigidBodyState3D, point: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = point, q = rotation(body);
  const tx = 2 * (q[1] * z - q[2] * y), ty = 2 * (q[2] * x - q[0] * z), tz = 2 * (q[0] * y - q[1] * x);
  return [body.x + x + q[3] * tx + q[1] * tz - q[2] * ty, body.y + y + q[3] * ty + q[2] * tx - q[0] * tz, body.z + z + q[3] * tz + q[0] * ty - q[1] * tx];
}

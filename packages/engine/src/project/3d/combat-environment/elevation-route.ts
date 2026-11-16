import { hypot, sqrt } from '../../../math/simulation.ts';
import type { RigidWorld3D } from '../../../physics/rigid-3d.ts';
import type { CombatProject3D } from '../combat-declaration.ts';
import type { CombatTraversalDecision, CombatTraversalPlan, CombatTraversalRequest } from './traversal-plan.ts';
import { createCombatObstacleRoute } from './obstacle-route.ts';
import { createCombatJumpClearance } from './jump-clearance.ts';

type Support = { id: string; x: number; y: number; bottom: number; z: number; hx: number; hz: number };
const zero = () => ({ x: 0, y: 0, z: 0 });

/** Live horizontal supports suggest ordinary jump/drop inputs, never physics changes. */
export function createCombatElevationRoute(options: { world: RigidWorld3D; bodyIds: readonly string[]; movement: NonNullable<CombatProject3D['movement']>; gravityY: (fighterId: string) => number }) {
  const { world, movement } = options;
  const detour = createCombatObstacleRoute(options);
  const stepObstacles: string[] = [];
  const stepDetour = createCombatObstacleRoute({ ...options, bodyIds: stepObstacles });
  const clearJump = createCombatJumpClearance(options);
  return (request: CombatTraversalRequest): CombatTraversalDecision | undefined => {
    const gravity = Math.abs(options.gravityY(request.fighterId)) || 9.81;
    const actor = world.body(request.fighterId), target = world.body(request.targetId);
    if (!actor || !target) return undefined;
    const radius = actor.shape.kind === 'sphere' ? actor.shape.radius : actor.shape.halfY;
    const targetRadius = target.shape.kind === 'sphere' ? target.shape.radius : target.shape.halfY;
    const feet = actor.y - radius, targetFeet = target.y - targetRadius;
    const supports: Support[] = [];
    for (const id of options.bodyIds) {
      const body = world.body(id);
      if (!body || body.type !== 'static' || body.trigger || !body.collisionMask || body.shape.kind !== 'box' || Math.abs(body.rotationX) + Math.abs(body.rotationY) + Math.abs(body.rotationZ) > .001 || body.shape.halfX < .4 || body.shape.halfZ < .4) continue;
      if (body.x + body.shape.halfX < Math.min(actor.x, target.x) - 12 || body.x - body.shape.halfX > Math.max(actor.x, target.x) + 12
        || body.z + body.shape.halfZ < Math.min(actor.z, target.z) - 12 || body.z - body.shape.halfZ > Math.max(actor.z, target.z) + 12) continue;
      supports.push({ id, x: body.x, y: body.y + body.shape.halfY, bottom: body.y - body.shape.halfY, z: body.z, hx: body.shape.halfX, hz: body.shape.halfZ });
    }
    if (supports.length > 64) return undefined;
    // Auto-step raises the body just above a tread before the next contact is
    // reported. Keep following that tread through this tiny support gap.
    const stepping = (movement.autoStepHeight ?? 0) > 0 && !request.grounded && Math.abs(actor.velocityY) < 1 && supports.some(s =>
      Math.abs(s.y - feet) < .06 && hypot(Math.max(0, Math.abs(actor.x - s.x) - s.hx), Math.max(0, Math.abs(actor.z - s.z) - s.hz)) < radius);
    const coveredTarget = supports.some(s => s.y > targetFeet + targetRadius * 2 && Math.abs(target.x - s.x) < s.hx && Math.abs(target.z - s.z) < s.hz);
    let plan = request.plan ? structuredClone(request.plan) : undefined;
    if (plan && (!world.body(plan.surfaceId)?.collisionMask || plan.point.y >= plan.takeoff.y && targetFeet < plan.point.y - radius - 1.5)) plan = undefined;
    if (plan?.phase === 'approach' && request.grounded && Math.abs(actor.y - plan.takeoff.y) > .5) plan = undefined;
    const invalidated = !!request.plan && !plan;
    if (!request.grounded && !stepping && !plan && !invalidated) return undefined;
    if (request.grounded && Math.abs(targetFeet - feet) < .35) {
      const direction = supportedWalk(supports, actor, target, feet);
      return direction ? { direction, jump: false } : undefined;
    }
    if ((request.grounded || stepping) && targetFeet > feet + .35 && (movement.autoStepHeight ?? 0) > 0) {
      const point = stepRoute(supports, actor, target, feet, targetFeet, movement.autoStepHeight!, radius);
      if (point) {
        // A direct diagonal to a low tread can cross the solid side of taller
        // risers. Route around those sides while allowing ordinary auto-steps.
        stepObstacles.length = 0;
        for (const id of options.bodyIds) {
          const body = world.body(id);
          if (body?.shape.kind === 'box' && body.y + body.shape.halfY <= feet + movement.autoStepHeight! + .03) continue;
          stepObstacles.push(id);
        }
        const x = point.x - actor.x, z = point.z - actor.z, length = hypot(x, z);
        const direction = stepDetour(request.fighterId, request.targetId, { ...point, y: actor.y }) ?? { x: x / length, y: 0, z: z / length };
        return { direction, jump: false };
      }
    }
    if (!request.grounded && !plan && !invalidated) return undefined;
    if (plan?.phase === 'air' && request.grounded) plan = undefined;
    if (!plan) {
      if (targetFeet < feet - 1.2 || !request.grounded) {
        const floor = supports.filter(s => s.y <= targetFeet + .3 && Math.abs(target.x - s.x) < s.hx && Math.abs(target.z - s.z) < s.hz).sort((a, b) => b.y - a.y)[0];
        if (!floor) return undefined;
        const edge = request.grounded ? dropEdge(supports, actor, feet, target, radius, targetFeet) : { x: actor.x, y: actor.y, z: actor.z };
        if (!edge) return undefined;
        // A target under a ceiling cannot be reached by steering a rooftop jump
        // directly at its X/Z. First land on the exposed lower step at the edge.
        const landing = coveredTarget ? supports.filter(s => s.y < feet - .35 && Math.abs(edge.x - s.x) < s.hx && Math.abs(edge.z - s.z) < s.hz).sort((a, b) => b.y - a.y)[0] : undefined;
        plan = { surfaceId: landing?.id ?? floor.id, point: { x: landing ? edge.x : target.x, y: (landing ?? floor).y + radius, z: landing ? edge.z : target.z }, takeoff: edge, phase: request.grounded ? 'drop' : 'air', wait: 0 };
      } else {
        plan = chooseAscent(supports, { x: actor.x, y: feet, z: actor.z }, { x: target.x, y: targetFeet, z: target.z }, radius, movement.jumpSpeed, movement.speed, gravity, clearJump);
        if (!plan) return undefined;
      }
    }
    if (plan.phase === 'drop') {
      if (!coveredTarget) { plan.point.x = target.x;plan.point.z = target.z; }
      if (request.grounded && hypot(actor.x - plan.takeoff.x, actor.z - plan.takeoff.z) < 2 && request.stamina >= (movement.jumpCost ?? 0)) {
        plan.phase = 'launch';plan.wait = request.delay + 12;
        return { plan, direction: zero(), jump: true };
      }
      if (!request.grounded && actor.y < plan.takeoff.y - .5) plan.phase = 'air';
    }
    if (plan.phase === 'launch') {
      if (!request.grounded) plan.phase = 'air';
      else if (plan.wait-- > 0) return { plan, direction: zero(), jump: false };
      else { plan.phase = 'approach';plan.wait = 0; }
    }
    if (plan.phase === 'air') {
      const delay = request.delay / 60, remainingHeight = actor.y - plan.point.y;
      const discriminant = actor.velocityY * actor.velocityY + 2 * gravity * remainingHeight;
      const time = Math.max(.3, discriminant >= 0 ? (actor.velocityY + sqrt(discriminant)) / gravity : .5);
      // Queue a released stick before touchdown. An air correction arriving on
      // the ground becomes a full-speed step and can run off a narrow landing.
      if (actor.velocityY < 0 && discriminant >= 0 && (actor.velocityY + sqrt(discriminant)) / gravity < delay + .08) return { plan, direction: zero(), jump: false };
      const desiredX = (plan.point.x - actor.x - actor.velocityX * delay) / time;
      const desiredZ = (plan.point.z - actor.z - actor.velocityZ * delay) / time;
      const x = desiredX - actor.velocityX, z = desiredZ - actor.velocityZ, length = Math.max(1, hypot(x, z));
      return { plan, direction: { x: x / length, y: 0, z: z / length }, jump: false };
    }
    const destination = plan.takeoff;
    const distance = hypot(destination.x - actor.x, destination.z - actor.z);
    if (plan.phase === 'approach') {
      if (distance < .9 && hypot(actor.velocityX, actor.velocityZ) < .3) {
        if (request.stamina < (movement.jumpCost ?? 0)) return { plan, direction: zero(), jump: false };
        plan.phase = 'launch';plan.wait = request.delay + 12;
        return { plan, direction: zero(), jump: true };
      }
      if (plan.wait > 0) { plan.wait--;return { plan, direction: zero(), jump: false }; }
      if (hypot(actor.velocityX, actor.velocityZ) > .3 && distance < movement.speed * request.delay / 60 + .35) { plan.wait = request.delay + 3;return { plan, direction: zero(), jump: false }; }
    }
    const direction = detour(request.fighterId, request.targetId, destination) ?? { x: (destination.x - actor.x) / (distance || 1), y: 0, z: (destination.z - actor.z) / (distance || 1) };
    return { plan, direction, jump: false };
  };
}

function supportedWalk(supports: readonly Support[], actor: { x: number; z: number }, target: { x: number; z: number }, feet: number) {
  const level = supports.filter(s => Math.abs(s.y - feet) < .35);
  const clear = (x: number, z: number) => {
    const intervals: [number, number][] = [];
    for (const s of level) {
      let start = 0, end = 1;
      for (const [origin, delta, low, high] of [[actor.x, x - actor.x, s.x - s.hx, s.x + s.hx], [actor.z, z - actor.z, s.z - s.hz, s.z + s.hz]] as const) {
        if (Math.abs(delta) < 1e-8) { if (origin < low || origin > high) end = -1; }
        else { const a = (low - origin) / delta, b = (high - origin) / delta;start = Math.max(start, Math.min(a, b));end = Math.min(end, Math.max(a, b)); }
      }
      if (start <= end) intervals.push([start, end]);
    }
    intervals.sort((a, b) => a[0] - b[0]);
    let covered = 0;
    for (const [start, end] of intervals) { if (start > covered + 1e-6) return false;covered = Math.max(covered, end); }
    return covered >= 1;
  };
  if (clear(target.x, target.z)) return undefined;
  // Connected supports supply visible bridge waypoints instead of cutting a
  // diagonal across a gap merely because the destination is at the same height.
  let best = Infinity, waypoint: { x: number; z: number } | undefined;
  for (const a of level) for (const b of level) {
    if (a === b) continue;
    const left = Math.max(a.x - a.hx, b.x - b.hx), right = Math.min(a.x + a.hx, b.x + b.hx);
    const near = Math.max(a.z - a.hz, b.z - b.hz), far = Math.min(a.z + a.hz, b.z + b.hz);
    if (left > right || near > far) continue;
    const x = (left + right) / 2, z = (near + far) / 2;
    const distance = hypot(x - actor.x, z - actor.z);
    const score = distance + hypot(target.x - x, target.z - z);
    if (distance < .2 || score >= best || !clear(x, z)) continue;
    best = score;waypoint = { x, z };
  }
  if (!waypoint) return undefined;
  const distance = hypot(waypoint.x - actor.x, waypoint.z - actor.z);
  return { x: (waypoint.x - actor.x) / distance, y: 0, z: (waypoint.z - actor.z) / distance };
}

/** Connected walkable risers are a walking route, not a reason to repeatedly
 * jump onto unrelated nearby props. Live support heights use the same step cap
 * as human locomotion; physics still decides whether each step succeeds. */
function stepRoute(supports: readonly Support[], actor: { x: number; z: number }, target: { x: number; z: number }, feet: number, targetFeet: number, stepHeight: number, radius: number) {
  const frontier = supports.filter(s => Math.abs(s.y - targetFeet) < .35 && Math.abs(target.x - s.x) <= s.hx && Math.abs(target.z - s.z) <= s.hz);
  const connected = new Set(frontier.map(s => s.id));
  if (!connected.size) return undefined;
  for (let index = 0; index < frontier.length; index++) {
    const upper = frontier[index]!;
    for (const lower of supports) {
      if (connected.has(lower.id)) continue;
      if (upper.y >= lower.y - .03 && upper.y - lower.y <= stepHeight + .03
        && Math.abs(upper.x - lower.x) <= upper.hx + lower.hx + .05 && Math.abs(upper.z - lower.z) <= upper.hz + lower.hz + .05) {
        connected.add(lower.id);frontier.push(lower);
      }
    }
  }
  let best = Infinity, point: { x: number; z: number } | undefined;
  // Enter the next riser before aiming at a higher one. A nominally walkable
  // two-riser shortcut can approach its side under the following stair corner.
  let nextHeight = Infinity;
  for (const support of supports) if (connected.has(support.id) && support.y > feet + .1) nextHeight = Math.min(nextHeight, support.y);
  for (const support of supports) {
    if (!connected.has(support.id) || support.y > nextHeight + .03 || support.y <= feet + .1 || support.y > feet + stepHeight + .03) continue;
    const insetX = Math.min(radius + .1, support.hx), insetZ = Math.min(radius + .1, support.hz);
    const x = Math.max(support.x - support.hx + insetX, Math.min(support.x + support.hx - insetX, target.x));
    const z = Math.max(support.z - support.hz + insetZ, Math.min(support.z + support.hz - insetZ, target.z));
    const score = hypot(x - actor.x, z - actor.z) + hypot(target.x - x, target.z - z) + (targetFeet - support.y);
    if (score < best) { best = score;point = { x, z }; }
  }
  if (!point) return undefined;
  const x = point.x - actor.x, z = point.z - actor.z, length = hypot(x, z);
  return length > .05 ? point : undefined;
}

function chooseAscent(supports: readonly Support[], actor: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, radius: number, jump: number, speed: number, gravity: number, clearJump: ReturnType<typeof createCombatJumpClearance>): CombatTraversalPlan | undefined {
  const rise = jump * jump / (2 * gravity) * .45;
  let best = Infinity, plan: CombatTraversalPlan | undefined;
  for (const support of supports) {
    if (support.hx < .6 || support.hz < .6) continue;
    const up = support.y - actor.y;
    if (up < .5 || up > rise || support.y > target.y + .3) continue;
    // At this prototype scale, a higher landing that approaches the target is useful;
    // lower landings remain available when the next rise exceeds the jump arc.
    for (const [dx, dz] of [[support.hx + radius + .4, 0], [-support.hx - radius - .4, 0], [0, support.hz + radius + .4], [0, -support.hz - radius - .4]]) {
      const x = support.x + dx!, z = support.z + dz!;
      const ground = supports.some(s => Math.abs(s.y - actor.y) < .3 && Math.abs(x - s.x) < s.hx && Math.abs(z - s.z) < s.hz);
      const blocked = supports.some(s => s.y > actor.y + .3 && s.bottom < actor.y + radius * 2 && Math.abs(x - s.x) < s.hx + radius && Math.abs(z - s.z) < s.hz + radius);
      if (!ground || blocked) continue;
      const flight = (jump + sqrt(Math.max(0, jump * jump - 2 * gravity * up))) / gravity;
      if (hypot(dx!, dz!) > speed * flight * .5) continue;
      const score = hypot(x - actor.x, z - actor.z) + hypot(target.x - support.x, target.z - support.z) + Math.max(0, target.y - support.y) * 4;
      if (score >= best) continue;
      // Leave clearance from the next riser rather than landing against its
      // vertical face when neighbouring steps meet at the support centre.
      const inset = Math.min(.35, Math.min(support.hx, support.hz) * .35), length = hypot(dx!, dz!);
      const point = { x: support.x + dx! / length * inset, y: support.y + radius, z: support.z + dz! / length * inset };
      if (!clearJump({ x, y: actor.y + radius, z }, point, jump, gravity, radius)) continue;
      best = score;plan = { surfaceId: support.id, point, takeoff: { x, y: actor.y + radius, z }, phase: 'approach', wait: 0 };
    }
  }
  return plan;
}

function dropEdge(supports: readonly Support[], actor: { x: number; y: number; z: number }, feet: number, target: { x: number; z: number }, radius: number, targetFeet: number) {
  let best = Infinity, selected: { x: number; y: number; z: number } | undefined;
  for (const support of supports) {
    if (Math.abs(support.y - feet) > .35 || Math.abs(actor.x - support.x) > support.hx + .2 || Math.abs(actor.z - support.z) > support.hz + .2) continue;
    for (const [x, z] of [[support.x - support.hx - radius - .4, actor.z], [support.x + support.hx + radius + .4, actor.z], [actor.x, support.z - support.hz - radius - .4], [actor.x, support.z + support.hz + radius + .4]]) {
      if (supports.some(s => Math.abs(s.y - feet) < .35 && Math.abs(x! - s.x) < s.hx + .2 && Math.abs(z! - s.z) < s.hz + .2)) continue;
      const landing = supports.filter(s => s.y < feet - .35 && Math.abs(x! - s.x) < s.hx && Math.abs(z! - s.z) < s.hz).sort((a, b) => b.y - a.y)[0];
      if (!landing) continue;
      const cost = hypot(x! - actor.x, z! - actor.z) + hypot(x! - target.x, z! - target.z) + Math.abs(landing.y - targetFeet) * 8;
      if (cost < best) { best = cost;selected = { x: x!, y: actor.y, z: z! }; }
    }
  }
  return selected;
}

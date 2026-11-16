import { atan2, cos, hypot, sin } from '../../math/simulation.ts';
import type { CombatSnapshot, CombatCollision } from '../../combat/state.ts';
import type { RigidContact3D } from '../../physics/rigid-3d.ts';
import type { Hyperfocus3DRuntime } from '../runtime-3d.ts';
import type { CombatProject3D } from './combat-declaration.ts';
import { initialMotion, validateCombatMotion } from './combat-motion/state.ts';
import type { CombatVector } from '../../combat/config.ts';
import { createCombatAutoStep } from './combat-motion/auto-step.ts';
import { sampleAttackTravel } from './combat-motion/attack.ts';

export type CombatMotionControl = { actions: ReadonlySet<string>; previous: ReadonlySet<string>; direction: CombatVector; releaseDirection?: CombatVector };

function readDirection(actions: ReadonlySet<string>, runtime: Hyperfocus3DRuntime) {
  const x = Number(actions.has('move-right')) - Number(actions.has('move-left'));
  const z = Number(actions.has('move-down')) - Number(actions.has('move-up'));
  const length = hypot(x, z) || 1;
  const scene = runtime.declaration.scenes.find(item => item.id === runtime.declaration.activeSceneId)!;
  const camera = scene.camera, eye = runtime.cameraPosition();
  const target = camera.followEntityId ? runtime.snapshot().entities.find(item => item.id === camera.followEntityId)?.position ?? camera.target : camera.target;
  const bx = eye[0] - target[0], bz = eye[2] - target[2] || (bx ? 0 : 1), scale = hypot(bx, bz);
  return { x: (x * bz + z * bx) / scale / length, y: 0, z: (-x * bx + z * bz) / scale / length };
}
export function createCombatMotion3D(options: { runtime: Hyperfocus3DRuntime; definition: CombatProject3D }) {
  const { runtime, definition } = options;
  const autoStep = createCombatAutoStep({ physics: runtime.physics });
  const jumpGravity = new Map(runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities.map(entity => [entity.id, 9.81 * (entity.physics?.gravityScale ?? 1)]));
  let states = definition.fighters.map(f => initialMotion(f.entityId));
  const direction = (actions: ReadonlySet<string>) => readDirection(actions, runtime);
  function intent(id: string, actions: ReadonlySet<string>, previous: ReadonlySet<string>, grounded: ReadonlySet<string>, control?: CombatMotionControl) {
    const binding = definition.fighters.find(f => f.entityId === id)!, memory = states.find(f => f.id === id)!;
    let moving = memory.stepBuffer > 0 ? { x: memory.queuedX, y: 0, z: memory.queuedZ } : control?.direction ?? direction(actions);
    const controlled = binding.control === 'player' || !!control;
    const cross = controlled && actions.has(binding.actionPrefix + 'jump');
    const separate = definition.movement?.separateJump === true;
    const movementHeld = separate ? controlled && actions.has(binding.actionPrefix + 'dash') : cross;
    const fresh = (key: string) => controlled && actions.has(binding.actionPrefix + key) && !previous.has(binding.actionPrefix + key);
    // A completed frozen Cross gesture retains its own direction without
    // applying stale movement modifiers to a fresh attack on the resume tick.
    if (fresh('jump-release') && !hypot(moving.x, moving.z)) {
      const prefix = `${binding.actionPrefix}jump-release/`;
      moving = control?.releaseDirection ?? direction(new Set([...actions].filter(action => action.startsWith(prefix)).map(action => action.slice(prefix.length))));
    }
    const directed = hypot(moving.x, moving.z) > 0;
    const hold = movementHeld ? Math.min(600, memory.hold + 1) : 0;
    const threshold = Math.max(15, definition.movement?.sprintHoldFrames ?? 15);
    const supported = grounded.has(id) && (runtime.physics.body(id)?.velocityY ?? 0) <= .1;
    const wall = !supported && !actions.has(binding.actionPrefix + 'guard') ? surfaces().walls.get(id) : undefined;
    const wallJump = !!wall && (definition.movement?.wallJumpSpeed ?? 0) > 0 && (fresh('jump') || fresh('jump-tap') || fresh('jump-release'));
    const inward = wall ? moving.x * wall.x + moving.z * wall.z : 0;
    const tangent = wall ? hypot(moving.x - wall.x * inward, moving.z - wall.z * inward) : 0;
    const wallRun = !!wall && !wallJump && memory.dash === 0 && !fresh('dash') && inward < -.1 && tangent > .2 && (definition.movement?.wallRunFrames ?? 0) > (memory.wallId === wall.id ? memory.wallRunTicks : 0);
    if (separate) {
      const airStep = fresh('dash') && !supported;
      const neutralJump = fresh('jump') || fresh('jump-tap') || fresh('jump-release');
      const groundJump = supported || memory.coyote > 0;
      const airJump = !groundJump && (definition.movement?.airJumps ?? 0) > 0 && !memory.airJumpUsed;
      const jump = (neutralJump || memory.jumpBuffer > 0) && (groundJump || airJump);
      const step = (fresh('dash') || memory.stepBuffer > 0) && memory.recovery <= 1 && (!memory.airDash || supported);
      return { wall, wallJump, wallRun, moving, hold, sprint: !memory.sprintExhausted && movementHeld && directed && hold > threshold && supported,
        step: step && !jump && !wallJump, neutralJump, forcedJump: neutralJump, heldStep: false, airStep, jump, airJump };
    }
    const airStep = (fresh('jump') || fresh('jump-release')) && directed && !supported;
    const sprint = !memory.sprintExhausted && cross && directed && hold > threshold && grounded.has(id);
    const heldStep = cross && directed && hold === threshold && !memory.crossConsumed && supported;
    const step = (memory.stepBuffer > 0 || fresh('dash') || airStep || heldStep) && memory.recovery <= 1 && (!memory.airDash || supported);
    const releasedTap = controlled && !cross && previous.has(binding.actionPrefix + 'jump') && memory.hold > 0 && memory.hold < threshold && !memory.crossConsumed;
    const forcedJump = fresh('jump-tap') || fresh('jump-release') && !airStep || releasedTap;
    const neutralJump = forcedJump || fresh('jump') && !directed;
    const groundJump = supported || memory.coyote > 0;
    const airJump = !groundJump && (definition.movement?.airJumps ?? 0) > 0 && !memory.airJumpUsed;
    const jump = (neutralJump || memory.jumpBuffer > 0 && (memory.jumpQueued || !fresh('jump') && !fresh('dash'))) && (groundJump || airJump);
    return { wall, wallJump, wallRun, moving, hold, sprint, step: step && !jump && !forcedJump && !wallJump, neutralJump, forcedJump, heldStep, airStep, jump, airJump };
  }
  const contact: RigidContact3D = { a: 0, b: 0, aId: '', bId: '', normalX: 0, normalY: 0, normalZ: 0, penetration: 0, pointX: 0, pointY: 0, pointZ: 0, trigger: false, closingSpeedMetersPerSecond: 0, effectiveMassKg: 0, impactEnergyJoules: 0, normalImpulseNewtonSeconds: 0, breakthrough: false };
  function surfaces() {
    const walls = new Map<string, CombatVector & { id: string }>(), grounded = new Set<string>(), collisions = new Map<string, CombatCollision>();
    for (let i = 0; i < runtime.physics.contactCount(); i++) {
      runtime.physics.contact(i, contact);
      if (contact.trigger) continue;
      for (const state of states) {
        if (state.id !== contact.aId && state.id !== contact.bId) continue;
        const other = state.id === contact.aId ? contact.bId : contact.aId;
        if (states.some(f => f.id === other) || (runtime.physics.body(other)?.trigger || runtime.physics.body(other)?.collisionMask === 0)) continue;
        const body = runtime.physics.body(state.id);
        if (!body) continue;
        const sign = (body.x - contact.pointX) * contact.normalX + (body.y - contact.pointY) * contact.normalY + (body.z - contact.pointZ) * contact.normalZ >= 0 ? 1 : -1;
        const normal = { x: contact.normalX * sign, y: contact.normalY * sign, z: contact.normalZ * sign };
        if (normal.y > 0.5) grounded.add(state.id);
        else if (Math.abs(normal.y) < .25) walls.set(state.id, { ...normal, id: other });
        // A missed tech dissipates the measured impact. A fixed minimum would
        // turn every shallow fall into another launch and sustain repeated hops.
        // Strong slams keep the existing response and its 10 m/s rebound cap.
        if (contact.closingSpeedMetersPerSecond > 1 && !collisions.has(state.id)) collisions.set(state.id, { fighterId: state.id, normal, contactPoint: { x: contact.pointX, y: contact.pointY, z: contact.pointZ }, impulse: Math.min(10, contact.closingSpeedMetersPerSecond * 0.6) });
      }
    }
    return { grounded, walls, collisions: [...collisions.values()] };
  }
  return {
    surfaces,
    idle(id: string) {
      const body = runtime.physics.body(id), memory = states.find(state => state.id === id);
      return !!body && !!memory && hypot(body.velocityX, body.velocityZ) < .05 && Math.abs(body.velocityY) < .1 && memory.dash === 0 && !memory.wallRunning;
    },
    locked(id: string) { return states.find(f => f.id === id)?.locked ?? true; },
    holdingJump(id: string) { const state = states.find(f => f.id === id);return !!state && (state.jumpHold > 0 || state.jumpBuffer > 0 && state.jumpQueued); },
    attackEligible(id: string) { const state = states.find(f => f.id === id);return !!state && (state.dash > 0 || state.dashFollowupFrames > 0); },
    committed(id: string) { return (states.find(f => f.id === id)?.dash ?? 0) > 0; },
    startingDash(id: string, actions: ReadonlySet<string>, previous: ReadonlySet<string>, grounded: ReadonlySet<string>, control?: CombatMotionControl) { const key = definition.fighters.find(f => f.entityId === id)!.actionPrefix + 'dash';return !!definition.movement && actions.has(key) && !previous.has(key) && intent(id, actions, previous, grounded, control).step; },
    cost(id: string, actions: ReadonlySet<string>, previous: ReadonlySet<string>, grounded: ReadonlySet<string>, control?: CombatMotionControl) {
      if (!definition.movement) return undefined;
      const input = intent(id, actions, previous, grounded, control);
      return input.wallJump ? definition.movement.wallJumpCost ?? definition.movement.jumpCost ?? 0 : input.wallRun ? definition.movement.wallRunCost ?? definition.movement.sprintCost ?? .35 : input.jump ? definition.movement.jumpCost ?? 0 : input.step ? definition.movement.stepCost ?? 12 : input.sprint ? definition.movement.sprintCost ?? .35 : undefined;
    },
    reset() { states = definition.fighters.map(f => initialMotion(f.entityId)); },
    capture() { return structuredClone(states); },
    validate(value: unknown) { return validateCombatMotion(value, states); },
    restore(value: ReturnType<typeof initialMotion>[]) { states = structuredClone(value); },
    direction,
    step(state: CombatSnapshot, actions: ReadonlySet<string>, previous: ReadonlySet<string>, grounded: ReadonlySet<string>, controls?: ReadonlyMap<string, CombatMotionControl>, groundSpeedScales?: ReadonlyMap<string, number>) {
      const suppressed = new Set<string>(), walls = surfaces().walls;
      for (const fighter of state.fighters) {
        const binding = definition.fighters.find(f => f.entityId === fighter.id)!;
        const memory = states.find(f => f.id === fighter.id)!;
        const body = runtime.physics.body(fighter.id)!;
        const move = definition.config.moves.find(m => m.id === fighter.moveId);
        const tuning = definition.movement;
        const energy = (definition.config.maxStamina ?? 0) > 0 ? Math.max(0, Math.min(1, fighter.stamina / definition.config.maxStamina!)) : 1;
        const staminaScale = 1 - (1 - (tuning?.exhaustedMovementScale ?? 1)) * (1 - energy);
        const accelerationScale = (tuning?.accelerationScale ?? 1) * staminaScale;
        const control = controls?.get(fighter.id);
        const activeActions = control?.actions ?? actions, oldActions = control?.previous ?? previous;
        const player = binding.control === 'player' || !!control;
        const pressed = (key: string) => player && activeActions.has(binding.actionPrefix + key) && !oldActions.has(binding.actionPrefix + key);
        const input = intent(fighter.id, activeActions, oldActions, grounded, control);
        memory.wallSliding = false; memory.wallRunning = false;
        if (!activeActions.has(binding.actionPrefix + (tuning?.separateJump ? 'dash' : 'jump'))) memory.sprintExhausted = false;
        const releasingJump = memory.jumpHold > 0 && !activeActions.has(binding.actionPrefix + 'jump');
        const releaseScale = 1 - (1 - (tuning?.jumpReleaseSpeedRatio ?? 1)) * memory.jumpHold / Math.max(1, tuning?.jumpHoldFrames ?? 0);
        if (!activeActions.has(binding.actionPrefix + 'jump')) memory.jumpHold = 0;
        // Once sprint payment fails, keep walking and recovering until release.
        // Both player and AI controls pass through this saved gesture latch.
        if (input.sprint && !fighter.locomotionAllowed && !move && !fighter.stunFrames && !fighter.landingFrames) memory.sprintExhausted = true;
        if (memory.dashFollowupFrames > 0) memory.dashFollowupFrames--;
        if (memory.stepSlowFrames > 0) memory.stepSlowFrames--;
        if (memory.dash > 0) memory.dashAge = Math.min(memory.dashDuration, memory.dashAge + 1);
        if (memory.dashCue > 0) memory.dashCue--;
        const rearmed = memory.airDash && grounded.has(fighter.id) && body.velocityY <= .1;
        if (memory.stepBuffer > 0) memory.stepBuffer--;
        // An accepted landing tap waits through the authored landing lock. It
        // still expires normally in the air and cannot repeat after consumption.
        if (memory.jumpBuffer > 0 && fighter.landingFrames === 0) memory.jumpBuffer--;
        if (memory.jumpIntent > 0) memory.jumpIntent--;
        if (memory.coyote > 0) memory.coyote--;
        if (grounded.has(fighter.id) && body.velocityY <= .1) memory.coyote = tuning?.coyoteFrames ?? 5;
        if (grounded.has(fighter.id) && body.velocityY <= 0.1) { memory.airDash = false; memory.airJumpUsed = false; memory.wallId = ''; memory.wallRunTicks = 0; }
        if (memory.recovery > 0) memory.recovery--;
        if (pressed('lockon')) memory.locked = !memory.locked;
        if (fighter.stunFrames > 0 || fighter.health <= 0 || fighter.protectionFrames > 0) {
          suppressed.add(fighter.id); memory.dashFollowupFrames = 0; memory.stepSlowFrames = 0; memory.dashCancelFrames = 0; memory.dashCue = 0; memory.dash = 0; memory.hold = 0; memory.jumpHold = 0; memory.crossConsumed = true; memory.coasting = false; memory.stepBuffer = 0; memory.jumpBuffer = 0; memory.jumpQueued = false; memory.jumpIntent = 0; memory.coyote = 0;
          // Impact travel loses horizontal energy; repeated light hits should not
          // accelerate a defender forever beyond every possible follow-up.
          if (fighter.stunKind === 'hit' && fighter.health > 0) runtime.physics.setVelocity(fighter.id, body.velocityX * .985, body.velocityY, body.velocityZ * .985);
          // Direction is sampled by combat at impact; hitstun never adds midair thrust.
          continue;
        }
        if (!move && rearmed) { memory.dashCue = 14; memory.dashCueKind = 3; }
        if (!move && !grounded.has(fighter.id) && memory.airDash && (input.airStep || pressed('dash'))) { memory.dashCue = 12; memory.dashCueKind = 2; }
        if (!tuning && move?.movementSpeed === undefined) continue;
        suppressed.add(fighter.id);
        memory.hold = input.hold;
        if (pressed('jump')) memory.crossConsumed = input.neutralJump || input.airStep;
        if (input.heldStep) memory.crossConsumed = true;
        if (input.forcedJump) memory.jumpQueued = true;
        // A Drive tap survives legal strings as one saved intention. Once the
        // chain ends it has only the ordinary short landing window, never an
        // indefinite future hop after an airborne move.
        if (memory.jumpQueued && (move || input.forcedJump)) memory.jumpBuffer = Math.max(1, tuning?.jumpBufferFrames ?? 8);
        else if (!memory.jumpQueued && input.neutralJump) memory.jumpBuffer = tuning?.jumpBufferFrames ?? 8;
        else if (!memory.jumpQueued && (pressed('jump') || pressed('dash'))) memory.jumpBuffer = 0;
        if (memory.jumpBuffer === 0) memory.jumpQueued = false;
        const moving = player ? input.moving : { x: 0, y: 0, z: 0 };
        let dx = moving.x, dz = moving.z, speed = tuning?.speed ?? 4, dashing = false;
        if (move) {
          if (pressed('dash') || input.heldStep || input.airStep) {
            memory.stepBuffer = definition.config.inputBufferFrames; memory.queuedX = moving.x; memory.queuedZ = moving.z;
          }
          if (memory.dash > 0 && fighter.moveFrame === 1) {
            memory.dashCancelDuration = Math.min(move.dashTransitionFrames ?? 6, move.startupFrames);
            memory.dashCancelFrames = memory.dashCancelDuration;
            memory.dashCancelX = body.velocityX;memory.dashCancelZ = body.velocityZ;
          }
          if (!memory.dashCancelFrames) memory.dashCue = 0;
          memory.dashFollowupFrames = 0; memory.dash = 0; memory.coasting = false;
          memory.jumpHold = 0;
          const steering = move.steering ?? 0;
          const angle = (move.movementAngle ?? 0) * (move.direction === 'side' ? fighter.attackSide : 1);
          const fx = fighter.facing.x * cos(angle) - fighter.facing.z * sin(angle);
          const fz = fighter.facing.x * sin(angle) + fighter.facing.z * cos(angle);
          dx = fx * (1 - steering) + dx * steering;
          dz = fz * (1 - steering) + dz * steering;
          speed = sampleAttackTravel(move, fighter).speed;
        } else if (tuning) {
          memory.hold = input.hold;
          if (input.jump && !input.wallJump && fighter.locomotionAllowed) {
            if (input.airJump) { memory.airJumpUsed = true; memory.dashCue = 12; memory.dashCueKind = 4; }
            memory.jumpBuffer = 0; memory.jumpQueued = false; memory.coyote = 0; memory.stepBuffer = 0;
            memory.jumpIntent = tuning.jumpBufferFrames ?? 8;
            memory.jumpHold = activeActions.has(binding.actionPrefix + 'jump') ? tuning.jumpHoldFrames ?? 0 : 0;
            runtime.physics.setVelocity(fighter.id, body.velocityX, tuning.jumpSpeed * (memory.jumpHold ? 1 : tuning.jumpReleaseSpeedRatio ?? 1), body.velocityZ);
          }
          if (input.step && fighter.locomotionAllowed) {
            memory.stepBuffer = 0;
            memory.dashFollowupFrames = 0;memory.dashAirborne = !grounded.has(fighter.id);memory.dashAge = 0;memory.dashDuration = tuning.dashFrames;memory.dashCancelFrames = 0;
            memory.dashCue = tuning.dashFrames;memory.dashCueKind = 1;
            memory.dash = tuning.dashFrames; memory.recovery = tuning.dashFrames + tuning.dashRecoveryFrames;
            memory.airDash = input.airStep || !grounded.has(fighter.id);
            if (memory.airDash) { memory.dashCue = tuning.dashFrames; memory.dashCueKind = 1; }
            memory.dx = dx || dz ? dx : fighter.facing.x; memory.dz = dx || dz ? dz : fighter.facing.z;
            const target = memory.locked && state.fighters.find(other => other.id !== fighter.id && other.stunKind === 'hit' && other.stunFrames > 0 && !grounded.has(other.id));
            const targetBody = target && runtime.physics.body(target.id);
            if (targetBody) {
              const tx = targetBody.x - body.x, ty = targetBody.y - body.y, tz = targetBody.z - body.z;
              const horizontal = hypot(tx, tz), distance = hypot(horizontal, ty);
              // A deliberate forward step chases a launch; it does not track after takeoff.
              if (ty > .5 && distance < tuning.dashSpeed * .6 && horizontal > 0 && (dx * tx + dz * tz) / horizontal > .7) {
                const targetTravel = (targetBody.velocityX * tx + targetBody.velocityZ * tz) / horizontal;
                const approach = Math.min(tuning.dashSpeed, Math.max(0, targetTravel + (horizontal - definition.config.hurtRadius * 2 - .1) / (tuning.dashFrames / 60)));
                memory.dx = tx / horizontal * approach / tuning.dashSpeed; memory.dz = tz / horizontal * approach / tuning.dashSpeed; memory.airDash = true;
                // Meet the launched body's ballistic arc at the follow-up beat.
                // Both bodies keep gravity after takeoff; no homing/hover refresh.
                runtime.physics.setVelocity(fighter.id, body.velocityX, Math.min(tuning.dashSpeed, targetBody.velocityY + ty / .4), body.velocityZ);
              }
            }
          }
          if (input.sprint && fighter.locomotionAllowed) { memory.dash = 0; speed = tuning.sprintSpeed ?? 12; memory.coasting = true; }
          else if (memory.dash > 0) {
            dashing = true; dx = memory.dx; dz = memory.dz;
            const progress = (tuning.dashFrames - memory.dash) / Math.max(1, tuning.dashFrames - 1);
            speed = tuning.dashSpeed * (1 - progress * (1 - (tuning.dashEndSpeedRatio ?? 1))) * Math.min(1, hypot(dx, dz));
            memory.dash--; if (memory.dash === 0) memory.dashFollowupFrames = 7; memory.coasting = true;
          }
          if (fighter.guarding && fighter.guardBrokenFrames === 0) speed *= 0.35;
        }
        if (!move) speed *= staminaScale;
        if (!move && grounded.has(fighter.id) && !input.jump && !input.wallJump) speed *= groundSpeedScales?.get(fighter.id) ?? 1;
        const length = !move && !dashing && memory.dash === 0 && !input.sprint ? Math.max(1, hypot(dx, dz)) : hypot(dx, dz) || 1;
        const latest = runtime.physics.body(fighter.id)!;
        // Attack travel steers the horizontal approach. Vertical momentum belongs
        // to jumping, launch impulses and gravity, never a repeated hover velocity.
        let vertical = latest.velocityY;
        if (move?.startupHopSpeed && fighter.moveFrame === 1) vertical = Math.max(vertical, move.startupHopSpeed);
        if (move?.diveAngle !== undefined && fighter.moveFrame === move.startupFrames + 1) {
          const pitch = memory.locked ? atan2(fighter.facing.y, hypot(fighter.facing.x, fighter.facing.z)) : grounded.has(fighter.id) ? 0 : move.diveAngle;
          vertical = sin(Math.max(grounded.has(fighter.id) ? 0 : -.9, Math.min(.35, pitch))) * speed;
        }
        if (!move && releasingJump && vertical > 0) vertical *= releaseScale;
        if (!move && memory.jumpHold > 0) {
          if (vertical > 0) vertical += (jumpGravity.get(fighter.id) ?? 9.81) * (1 - (tuning?.jumpHoldGravityScale ?? 1)) / 60;
          else memory.jumpHold = 0;
          memory.jumpHold = Math.max(0, memory.jumpHold - 1);
        }
        const wall = walls.get(fighter.id);
        if (!move && !fighter.guarding && !dashing && !input.jump && !grounded.has(fighter.id) && vertical < 0 && wall && (tuning?.wallSlideSpeed ?? 0) > 0 && moving.x * wall.x + moving.z * wall.z < -.3) {
          memory.wallSliding = true; vertical = Math.max(vertical, -tuning!.wallSlideSpeed!);
        }
        let vx = dx / length * speed, vz = dz / length * speed;
        if (!move && tuning && !dashing && memory.dash === 0 && !(input.sprint && fighter.locomotionAllowed)) {
          const airborne = !grounded.has(fighter.id) || input.jump;
          if (airborne) {
            const steering = (tuning.airSteering ?? 4) * accelerationScale / 60;
            vx = body.velocityX + moving.x * steering; vz = body.velocityZ + moving.z * steering;
            const limit = Math.max(hypot(body.velocityX, body.velocityZ), tuning.speed * staminaScale);
            const scale = Math.min(1, limit / (hypot(vx, vz) || 1)); vx *= scale; vz *= scale;
          } else if (memory.coasting) {
            const delta = hypot(vx - body.velocityX, vz - body.velocityZ);
            const blend = Math.min(1, (tuning.coastDeceleration ?? 18) / 60 / (delta || 1));
            vx = body.velocityX + (vx - body.velocityX) * blend; vz = body.velocityZ + (vz - body.velocityZ) * blend;
            if (delta <= (tuning.coastDeceleration ?? 18) / 60) memory.coasting = false;
          }
        }
        if (!move && tuning && grounded.has(fighter.id) && !dashing && memory.dash === 0) {
          const currentSpeed = hypot(body.velocityX, body.velocityZ), targetSpeed = hypot(vx, vz);
          const turning = targetSpeed > 0 && body.velocityX * vx + body.velocityZ * vz < currentSpeed * targetSpeed - .000001;
          if (targetSpeed > currentSpeed || turning) {
            vx = body.velocityX + (vx - body.velocityX) * accelerationScale;
            vz = body.velocityZ + (vz - body.velocityZ) * accelerationScale;
          }
        }
        if (!move && !fighter.guarding && fighter.locomotionAllowed && input.wall) {
          const wall = input.wall;
          if (input.wallJump) {
            vx = wall.x * (tuning?.wallJumpPushSpeed ?? tuning?.speed ?? 6) * staminaScale; vz = wall.z * (tuning?.wallJumpPushSpeed ?? tuning?.speed ?? 6) * staminaScale;
            vertical = tuning!.wallJumpSpeed!; memory.jumpHold = 0; memory.dashCue = 12; memory.dashCueKind = 5; memory.dx = wall.x; memory.dz = wall.z; memory.dash = 0; memory.jumpBuffer = 0; memory.jumpQueued = false; memory.crossConsumed = true;
            memory.wallId = wall.id; memory.wallRunTicks = tuning?.wallRunFrames ?? 0;
          } else if (input.wallRun && !dashing) {
            if (memory.wallId !== wall.id) { memory.wallId = wall.id; memory.wallRunTicks = 0; }
            memory.wallRunTicks++; memory.wallRunning = true; memory.dx = moving.x; memory.dz = moving.z;
            if (memory.airDash) { memory.airDash = false; memory.recovery = 0; memory.dashCue = 14; memory.dashCueKind = 3; }
            const inward = moving.x * wall.x + moving.z * wall.z;
            const tx = moving.x - wall.x * inward, tz = moving.z - wall.z * inward, scale = hypot(tx, tz) || 1;
            vx = tx / scale * (tuning?.wallRunSpeed ?? tuning?.speed ?? 6) * staminaScale - wall.x;
            vz = tz / scale * (tuning?.wallRunSpeed ?? tuning?.speed ?? 6) * staminaScale - wall.z;
            vertical = Math.max(vertical, -(tuning?.wallSlideSpeed ?? 3));
          }
        }
        if (move && memory.dashCancelFrames > 0) {
          const blend = 1 - (memory.dashCancelFrames - 1) / Math.max(1, memory.dashCancelDuration);
          vx = memory.dashCancelX + (vx - memory.dashCancelX) * blend;
          vz = memory.dashCancelZ + (vz - memory.dashCancelZ) * blend;
          memory.dashCancelFrames--;
        }
        if (!move && tuning && !fighter.landingFrames && !input.jump && !input.wallJump && memory.jumpHold === 0 && !memory.wallRunning) {
          if (autoStep(body, vx, vz, tuning.autoStepHeight ?? 0, grounded.has(fighter.id))) { memory.stepSlowFrames = 6;vertical = 0; }
          if (memory.stepSlowFrames > 0) { vx *= tuning.autoStepSpeedScale ?? .85;vz *= tuning.autoStepSpeedScale ?? .85; }
        }
        runtime.physics.setVelocity(fighter.id, vx, vertical, vz);
        const facing = move || memory.locked || !hypot(dx, dz) ? fighter.facing : { x: dx, y: 0, z: dz };
        runtime.applyCommands({ commands: [{ type: 'rotate', entityId: fighter.id, rotationY: atan2(facing.x, facing.z) }] });
      }
      return suppressed;
    },
  };
}

import type { PlayBox, PlayDefinition3D, PlayEvent, PlayVector } from './contracts.ts';
import { movePlayBody } from './spatial.ts';
import { setPlayPhase, type PlayState3D } from './state.ts';

export function stepPlayMotor(state: PlayState3D, def: PlayDefinition3D, held: ReadonlySet<string>, pressed: ReadonlySet<string>, boxes: readonly PlayBox[], emit: (event: PlayEvent, position: PlayVector) => void) {
  const m = def.movement, dt = 0.016666666666666666;
  state.tick++;state.phaseAge++;state.yaw += (Number(held.has('look-left')) - Number(held.has('look-right'))) * def.camera.turnSpeed * dt;
  state.pitch = Math.max(-.7, Math.min(1.2, state.pitch + (Number(held.has('look-up')) - Number(held.has('look-down'))) * def.camera.turnSpeed * dt));
  if (state.grounded) state.coyote = m.coyoteTicks;else state.coyote = Math.max(0, state.coyote - 1);
  state.buffer = pressed.has('jump') ? m.bufferTicks + 1 : Math.max(0, state.buffer - 1);
  if (state.buffer && (state.grounded || state.coyote) && !state.anticipation && state.phase !== 'anticipate') { state.anticipation = m.anticipationTicks + 1;state.buffer = 0;state.coyote = 0;setPlayPhase(state, 'anticipate'); }
  if (state.anticipation && --state.anticipation === 0) { state.velocity[1] = m.jumpSpeed;state.grounded = false;emit('jump', [...state.position]); }
  if (!held.has('jump') && state.velocity[1] > m.jumpSpeed * .45) state.velocity[1] = m.jumpSpeed * .45;
  const x = Number(held.has('move-right')) - Number(held.has('move-left')), z = Number(held.has('move-down')) - Number(held.has('move-up')), inputLength = Math.max(1, Math.hypot(x, z));
  const aiming = Boolean(def.shooter) && held.has('aim'), speed = m.speed * (aiming ? .55 : 1), moving = Boolean(x || z), beforeSpeed = Math.hypot(state.velocity[0], state.velocity[2]);
  const desired: PlayVector = [(x * Math.cos(state.yaw) + z * Math.sin(state.yaw)) / inputLength * speed, 0, (z * Math.cos(state.yaw) - x * Math.sin(state.yaw)) / inputLength * speed];
  const prior = [...state.position];
  for (const axis of [0, 2]) state.velocity[axis] += Math.max(-m.acceleration * dt, Math.min(m.acceleration * dt, desired[axis]! - state.velocity[axis]!));
  state.velocity[1] -= m.gravity * dt;
  const wasGrounded = state.grounded, incomingY = state.velocity[1];
  const next = movePlayBody(state.position, [state.velocity[0] * dt, state.velocity[1] * dt, state.velocity[2] * dt], m.radius, m.height, boxes);
  state.position = next.position;state.grounded = next.grounded;
  for (const axis of [0, 2]) state.velocity[axis] = (state.position[axis]! - prior[axis]!) / dt;
  if (state.grounded || state.position[1] - prior[1]! < state.velocity[1] * dt - .0001 && state.velocity[1] > 0) state.velocity[1] = 0;
  state.distance += Math.hypot(state.position[0] - prior[0]!, state.position[2] - prior[2]!);
  const requestedFacing = aiming ? state.yaw + Math.PI : moving ? Math.atan2(desired[0], desired[2]) : state.facing;
  const turn = Math.atan2(Math.sin(requestedFacing - state.facing), Math.cos(requestedFacing - state.facing));state.facing += Math.max(-.16, Math.min(.16, turn));
  if (!wasGrounded && state.grounded && incomingY < -1) { setPlayPhase(state, 'land');emit('land', [...state.position]); }
  else if (state.anticipation) setPlayPhase(state, 'anticipate');
  else if (!state.grounded) setPlayPhase(state, state.velocity[1] > 0 ? 'rise' : 'fall');
  else if (state.phase === 'land' && state.phaseAge < 10 || ['fire', 'edit', 'reload', 'celebrate'].includes(state.phase)) return;
  else if (aiming) setPlayPhase(state, moving ? 'aimMove' : 'aim');
  else if (Math.abs(turn) > .8 && moving) setPlayPhase(state, 'turn');
  else if (moving && beforeSpeed < .1) setPlayPhase(state, 'start');
  else if (state.phase === 'start' && state.phaseAge < 8) return;
  else if (!moving && beforeSpeed > .1) setPlayPhase(state, 'stop');
  else setPlayPhase(state, moving ? 'move' : 'idle');
}

import { atan2, cos, hypot } from '../../../math/simulation.ts';
import type { CombatConfig, CombatVector } from '../../../combat/config.ts';
import type { CombatEvent, CombatInput, CombatSnapshot } from '../../../combat/state.ts';
import type { CombatInteractions } from './config.ts';
import { stepLooseWeapon } from './loose-weapon.ts';
import { rewriteWeaponInputs } from './weapons/attacks.ts';
import { steerCombatImpulse } from '../../../combat/input.ts';
import { advanceGrabAttempts, grabDirection, GRAB_RELEASE_RECOVERY, type GrabAttempt } from './grabs/attempts.ts';
import { activateWeaponEffect, advanceWeaponEffects, validateWeaponEffects, weaponMovementScales, type WeaponState, type UtilityState } from './weapons/utility.ts';
import { readCombatInteractionState3D } from './snapshot.ts';

type Grapple = { attacker: string; target: string; remaining: number; direction: CombatVector };
type Trace = { frame: number; kind: string; actor: string; target: string; value: number; position?: CombatVector };
type Saved = UtilityState & { weapons: WeaponState[]; grapples: Grapple[]; attempts?: GrabAttempt[]; trace: Trace[]; lastAttacks: Record<string, number> };
const zero = () => ({ x: 0, y: 0, z: 0 });
const vectorValid = (value: CombatVector | undefined) => !!value && [value.x, value.y, value.z].every(number => typeof number === 'number' && Number.isFinite(number) && Math.abs(number) <= 1e6);

/** Shared deterministic interaction rules; hosts supply the same presses for humans and AI. */
export function createCombatInteractions(options: { definition: CombatInteractions; config: CombatConfig; positions: ReadonlyMap<string, CombatVector>; fighterIds: readonly string[]; activeWeaponIds?: ReadonlySet<string>; surface?: (from: CombatVector, to: CombatVector, sweepRadius?: number) => { id: string; position: CombatVector; normal?: CombatVector } | undefined }) {
  const { definition, config } = options;
  for (const weapon of definition.weapons) {
    if (!options.positions.has(weapon.entityId) || options.fighterIds.includes(weapon.entityId) || !config.moves.some(move => move.id === weapon.lightMoveId) || !config.moves.some(move => move.id === weapon.heavyMoveId)) throw new Error('Weapon requires a non-fighter scene entity and authored light/heavy moves.');
  }
  const initial: Saved = { weapons: definition.weapons.map(weapon => ({ id: weapon.entityId, owner: '', durability: weapon.durability, length: weapon.length, position: { ...options.positions.get(weapon.entityId)! }, velocity: zero(), projectileOwner: '', serial: 0, ...(options.activeWeaponIds ? { active: options.activeWeaponIds.has(weapon.entityId) } : {}), ...(weapon.ammo === undefined ? {} : { ammo: weapon.ammo }) })), grapples: [], attempts: [], trace: [], lastAttacks: {} };
  let saved = structuredClone(initial);
  let transitions: Trace[] = [];
  const brokenOwners = new Set<string>();
  function log(frame: number, kind: string, actor: string, target: string, value = 0, position?: CombatVector) { const entry = { frame, kind, actor, target, value, ...(position ? { position: { ...position } } : {}) };saved.trace.push(entry);transitions.push(entry);if (saved.trace.length > 128) saved.trace.shift(); }
  function wear(item: WeaponState, amount: number, frame: number, cause: string, slice = false) {
    const original = definition.weapons.find(weapon => weapon.entityId === item.id)!;
    const previous = item.durability;
    item.durability = Math.max(0, item.durability - amount);
    // Wood splits under a harder edge, or when cumulative wear crosses half strength.
    slice ||= original.material === 'wood' && previous > original.durability / 2 && item.durability <= original.durability / 2;
    if (slice && item.durability) item.length = Math.max(original.length * .25, item.length * .5);
    log(frame, item.durability ? slice ? 'weapon-shortened' : 'weapon-wear' : 'weapon-broken', cause, item.id, item.durability, slice || !item.durability ? item.position : undefined);
    if (!item.durability) { if (item.owner) brokenOwners.add(item.owner);item.owner = '';item.projectileOwner = '';item.velocity = zero(); }
  }
  function event(state: CombatSnapshot, attackerId: string, targetId: string, kind: CombatEvent['kind'], damage = 0, impulse = zero(), defenseReason?: CombatEvent['defenseReason']): CombatEvent {
    return { id: `${state.frame}:interaction:${saved.trace.length}:${attackerId}:${targetId}`, frame: state.frame, attackerId, targetId, kind, damage, impulse, moveId: '', ...(defenseReason ? { defenseReason } : {}) };
  }
  function candidatesFor(state: CombatSnapshot, actor: CombatSnapshot['fighters'][number], heading: CombatVector) {
    const length = hypot(heading.x, heading.z) || 1, range = definition.grappleRange ?? 1.8;
    return [
      ...state.fighters.filter(fighter => fighter.id !== actor.id && fighter.health > 0 && !fighter.protectionFrames && !(fighter.stunFrames && fighter.stunKind !== 'block') && !saved.grapples.some(grapple => [grapple.attacker, grapple.target].includes(fighter.id))).map(fighter => ({ id: fighter.id, position: fighter.position, weapon: false, length: 0 })),
      ...saved.weapons.filter(item => item.active !== false && !item.owner && !item.projectileOwner && item.durability > 0).map(item => ({ id: item.id, position: item.position, weapon: true, length: item.length })),
    ].map(target => {
      const x = target.position.x - actor.position.x, y = target.position.y - actor.position.y, z = target.position.z - actor.position.z;
      const horizontal = hypot(x, z), reach = range + (target.weapon ? 0 : config.hurtRadius);
      // Loose tools are rendered along world X. Reach their visible shaft, not
      // an invisible center point beyond the player's hand.
      const shaftDistance = hypot(Math.max(0, Math.abs(x) - target.length / 2), z);
      const distance = target.weapon ? Math.max(shaftDistance, Math.abs(y)) : hypot(x, y, z);
      const aim = (x * heading.x + z * heading.z) / Math.max(.001, horizontal * length);
      const catchAim = (x * actor.facing.x + z * actor.facing.z) / Math.max(.001, horizontal * hypot(actor.facing.x, actor.facing.z));
      // A floor object uses planar reach, bounded vertically by the same reach.
      // Standing over it must not make a zero-length aim vector unpickable.
      const alignment = target.weapon && shaftDistance <= config.hurtRadius + .25 ? Math.max(.5, aim) : aim;
      const minimumAim = target.weapon ? 0 : .5;
      const eligibleAim = target.weapon ? alignment : catchAim;
      const supportPlane = target.weapon && !!definition.weapons.find(weapon => weapon.entityId === target.id)?.restPose;
      const contact = distance <= reach && eligibleAim >= minimumAim ? options.surface?.(actor.position, target.position, supportPlane ? 0 : undefined) : undefined;
      const obstructed = !!contact && (!target.weapon || (contact.normal?.y ?? 0) < .5 || hypot(contact.position.x - target.position.x, contact.position.y - target.position.y, contact.position.z - target.position.z) > .08);
      return { ...target, distance, alignment, reach, minimumAim, eligible: distance <= reach && eligibleAim >= minimumAim && !obstructed };
    });
  }
  function selectedCandidate(candidates: ReturnType<typeof candidatesFor>) {
    return candidates.filter(target => target.eligible).sort((a, b) => b.alignment - a.alignment || a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  }
  function before(state: CombatSnapshot, inputs: CombatInput[]) {
    transitions = [];brokenOwners.clear();
    advanceWeaponEffects(saved);
    const events: CombatEvent[] = [];
    const ready = advanceGrabAttempts(saved.attempts ??= [], state, inputs);
    for (const grapple of [...saved.grapples]) {
      const attacker = state.fighters.find(fighter => fighter.id === grapple.attacker)!;
      const target = state.fighters.find(fighter => fighter.id === grapple.target)!;
      const input = inputs.find(input => input.fighterId === target.id);
      // Contact itself is the first tech frame; the release tick is outside it.
      const tech = grapple.remaining > 1 && (input?.tech && !target.techHeld || input?.pressed?.includes('interact'));
      const attackerInput = inputs.find(input => input.fighterId === attacker.id);
      if (attackerInput?.direction) grapple.direction = grabDirection(attackerInput.direction);
      if (attacker.health <= 0 || target.health <= 0 || tech || --grapple.remaining <= 0) {
        saved.grapples.splice(saved.grapples.indexOf(grapple), 1);
        attacker.stunFrames = 0;attacker.stunKind = '';target.stunFrames = 0;target.stunKind = '';
        if (tech) {
          for (const fighter of [attacker, target]) { fighter.stunFrames = 12;fighter.stunKind = 'parry';fighter.guarding = false;fighter.history = []; }
          input!.pressed = input!.pressed?.filter(key => key !== 'interact');input!.tech = false;
          events.push(event(state, attacker.id, target.id, 'tech', 0, zero(), 'grapple-teched'));
          log(state.frame, 'grapple-tech', target.id, attacker.id);
        } else if (attacker.health > 0 && target.health > 0) {
          const damage = Math.min(target.health, definition.grappleDamage ?? 4);
          target.health -= damage;target.stunFrames = definition.grappleHitstunFrames ?? 36;target.stunKind = 'hit';
          attacker.stunFrames = definition.grappleRecoveryFrames ?? GRAB_RELEASE_RECOVERY;attacker.stunKind = 'parry';attacker.history = [];
          const speed = definition.grappleSpeed ?? 12;
          const neutral = hypot(grapple.direction.x, grapple.direction.z) < .3;
          const influence = input?.influenceDirection ?? input?.direction ?? target.influenceDirection;
          const impulse = steerCombatImpulse({ x: grapple.direction.x * speed, y: (neutral ? 4 : 2) * (definition.grappleVerticalSpeedScale ?? 1), z: grapple.direction.z * speed }, influence, config.directionalInfluence ?? 0);
          events.push({ ...event(state, attacker.id, target.id, 'hit', damage, impulse, 'grapple-not-teched'), hitstunFrames: definition.grappleHitstunFrames ?? 36 });
          log(state.frame, 'grapple-throw', attacker.id, target.id, damage);
        }
      }
    }
    for (const input of inputs) {
      const actor = state.fighters.find(fighter => fighter.id === input.fighterId)!;
      const item = saved.weapons.find(item => item.owner === actor.id);
      const fresh = input.pressed?.includes('interact');
      input.pressed = input.pressed?.filter(key => key !== 'interact');
      if (item) {
        const weapon = definition.weapons.find(weapon => weapon.entityId === item.id)!;
        rewriteWeaponInputs(config, input, weapon, item.ammo, item.spentSerial !== undefined);
        if (item.spentSerial !== undefined) { actor.history = [];continue; }
      }
      if (actor.health <= 0 || actor.stunFrames || actor.moveId && !(fresh && item)) {
        if (fresh && actor.health > 0) log(state.frame, 'interaction-recovering', actor.id, '', actor.stunFrames);
        continue;
      }
      const stick = input.direction;
      const heading = stick && hypot(stick.x, stick.z) > .1 ? stick : actor.facing;
      const length = hypot(heading.x, heading.z) || 1;
      const direction = { x: heading.x / length, y: 0, z: heading.z / length };
      if (fresh && item) {
        const opponent = state.fighters.filter(fighter => fighter.id !== actor.id && fighter.health > 0).sort((a, b) => hypot(a.position.x - actor.position.x, a.position.y - actor.position.y, a.position.z - actor.position.z) - hypot(b.position.x - actor.position.x, b.position.y - actor.position.y, b.position.z - actor.position.z))[0];
        const aim = opponent ? { x: opponent.position.x - actor.position.x, y: opponent.position.y - actor.position.y, z: opponent.position.z - actor.position.z } : actor.facing;
        const distance = hypot(aim.x, aim.y, aim.z) || 1;
        actor.moveId = '';actor.charging = false;actor.moveFrame = 0;actor.history = [];input.pressed = [];
        item.owner = '';item.projectileOwner = actor.id;item.position = { ...actor.position };item.velocity = { x: aim.x / distance * 18, y: aim.y / distance * 18 + 1, z: aim.z / distance * 18 };item.serial++;
        log(state.frame, 'weapon-thrown', actor.id, item.id);
      } else if (fresh) {
        const candidates = candidatesFor(state, actor, direction);
        const selected = selectedCandidate(ready.has(actor.id) ? candidates.filter(target => !target.weapon) : candidates);
        if (selected?.weapon) { saved.weapons.find(item => item.id === selected.id)!.owner = actor.id;log(state.frame, 'weapon-picked-up', actor.id, selected.id); }
        else if (!ready.has(actor.id) && (definition.grappleStartupFrames ?? 0) > 0) {
          const remaining = definition.grappleStartupFrames!;
          saved.attempts!.push({ attacker: actor.id, remaining, direction: grabDirection(input.direction) });
          actor.stunFrames = remaining + 1;actor.stunKind = 'parry';actor.guarding = false;actor.history = [];input.pressed = [];
          log(state.frame, 'grapple-windup', actor.id, '', atan2(actor.facing.x, actor.facing.z));
        }
        else if (selected && !saved.grapples.some(grapple => [grapple.attacker, grapple.target].includes(selected.id))) {
          const target = state.fighters.find(fighter => fighter.id === selected.id)!;
          const remaining = definition.grappleTechFrames ?? 12;
          const response = inputs.find(input => input.fighterId === target.id);
          log(state.frame, 'grapple-start', actor.id, target.id, remaining);
          // Simultaneous fresh grabs are inside the tech window, independent of seat order.
          if (!target.moveId && (!target.stunFrames || target.stunKind === 'block') && (response?.tech && !target.techHeld || response?.pressed?.includes('interact'))) {
            for (const fighter of [actor, target]) { fighter.stunFrames = 12;fighter.stunKind = 'parry';fighter.guarding = false;fighter.moveId = '';fighter.charging = false;fighter.history = []; }
            response.pressed = response.pressed?.filter(key => key !== 'interact');response.tech = false;
            events.push(event(state, actor.id, target.id, 'tech', 0, zero(), 'grapple-teched'));
            log(state.frame, 'grapple-tech', target.id, actor.id);
            continue;
          }
          for (const fighter of [actor, target]) { fighter.stunFrames = remaining + 1;fighter.stunKind = 'hit';fighter.moveId = '';fighter.charging = false;fighter.moveFrame = 0;fighter.history = []; }
          saved.grapples.push({ attacker: actor.id, target: target.id, remaining, direction: grabDirection(input.direction) });
        } else {
          // Explain the attempted direction, not a closer object behind the user.
          const aimed = candidates.filter(target => target.alignment >= target.minimumAim);
          const nearest = (aimed.length ? aimed : candidates).sort((a, b) => a.distance - b.distance)[0];
          const reason = !nearest || nearest.distance > nearest.reach ? 'grapple-out-of-range' : nearest.alignment < nearest.minimumAim ? 'grapple-facing-away' : 'grapple-obstructed';
          // An attempted grab is an action even when no target can be caught.
          // Recovery uses the same committed fighter lock as a connected grip.
          // Use the non-launch recovery lock: a running whiff must not masquerade
          // as a launched body and break a wall merely by contacting it.
          actor.stunFrames = definition.grappleWhiffFrames ?? 18;actor.stunKind = 'parry';actor.guarding = false;
          actor.history = [];input.pressed = [];
          log(state.frame, 'grapple-whiff', actor.id, '', atan2(direction.x, direction.z));
          log(state.frame, reason, actor.id, nearest?.id ?? '', nearest?.distance ?? 0);
        }
      }
      const held = saved.weapons.find(item => item.owner === actor.id);
      if (held) {
        const weapon = definition.weapons.find(weapon => weapon.entityId === held.id)!;
        rewriteWeaponInputs(config, input, weapon, held.ammo, held.spentSerial !== undefined);
      }
    }
    return events;
  }
  function after(state: CombatSnapshot, inputs: readonly CombatInput[], events: CombatEvent[]) {
    const armedFighters = new Set(saved.weapons.filter(item => item.owner).map(item => item.owner));
    for (const item of saved.weapons) {
      if (item.active === false) continue;
      const owner = state.fighters.find(fighter => fighter.id === item.owner);
      if (owner) {
        item.position = { x: owner.position.x + owner.facing.x * .5, y: owner.position.y + .4, z: owner.position.z + owner.facing.z * .5 };
        const weapon = definition.weapons.find(weapon => weapon.entityId === item.id)!;
        if (owner.moveId && saved.lastAttacks[owner.id] !== owner.attackSerial) {
          saved.lastAttacks[owner.id] = owner.attackSerial;
          const attack = config.moves.find(move => move.id === owner.moveId);
          if (weapon.kit === 'single-use' || weapon.kit === 'ground') {
            item.durability = 0;item.spentSerial = owner.attackSerial;
            log(state.frame, 'weapon-consumed', owner.id, item.id, 0);
          } else if (weapon.kit === 'spray' && owner.moveId === weapon.heavyMoveId) {
            item.ammo = Math.max(0, (item.ammo ?? weapon.ammo ?? 0) - 1);
            log(state.frame, 'weapon-sprayed', owner.id, item.id, item.ammo);
          } else if (attack?.pose !== 'back-hop') wear(item, owner.moveId === weapon.heavyMoveId || attack?.weaponAttack === 'heavy' ? 5 : 1, state.frame, owner.id);
        }
        const move = config.moves.find(move => move.id === owner.moveId);
        const zonesBefore = saved.zones?.length ?? 0;
        activateWeaponEffect(saved, item, weapon, state, config, events, options.surface);
        if ((saved.zones?.length ?? 0) > zonesBefore) log(state.frame, 'weapon-deployed', owner.id, item.id);
        if (item.spentSerial !== undefined && (!move || owner.attackSerial !== item.spentSerial || owner.health <= 0)) { item.owner = '';owner.history = []; }
        if (item.spentSerial === undefined && !(weapon.kit === 'spray' && owner.moveId === weapon.heavyMoveId) && move && owner.moveFrame === move.startupFrames + 1) {
          const contact = options.surface?.(owner.position, { x: owner.position.x + owner.facing.x * item.length, y: owner.position.y + owner.facing.y * item.length, z: owner.position.z + owner.facing.z * item.length });
          if (contact) wear(item, 3, state.frame, contact.id);
        }
        for (const contact of events) if (item.spentSerial === undefined && contact.targetId === owner.id && (contact.kind === 'block' || contact.kind === 'parry') && !armedFighters.has(contact.attackerId)) wear(item, 3, state.frame, contact.attackerId);
        for (const contact of events.filter(event => event.attackerId === owner.id && ['hit', 'block', 'parry', 'guard-break'].includes(event.kind))) {
          if (item.spentSerial !== undefined) log(state.frame, 'weapon-contact', owner.id, item.id);
          const other = saved.weapons.find(item => item.owner === contact.targetId);
          const otherMaterial = definition.weapons.find(weapon => weapon.entityId === other?.id)?.material;
          if (item.spentSerial === undefined && !(weapon.kit === 'spray' && owner.moveId === weapon.heavyMoveId)) wear(item, weapon.material === 'wood' && otherMaterial === 'metal' ? 12 : 3, state.frame, contact.targetId, weapon.material === 'wood' && otherMaterial === 'metal');
          if (other) {
            const material = definition.weapons.find(weapon => weapon.entityId === other.id)!.material;
            wear(other, weapon.material === 'metal' && material === 'wood' ? 12 : 3, state.frame, item.id, weapon.material === 'metal' && material === 'wood');
          }
          if (contact.kind === 'block' || contact.kind === 'parry') {
            const target = state.fighters.find(fighter => fighter.id === contact.targetId)!;
            const move = config.moves.find(move => move.id === contact.moveId);
            const chip = Math.min(Math.max(0, target.health - 1), (move?.damage ?? 0) * (contact.kind === 'parry' ? .1 : .3));
            target.health -= chip;contact.damage += chip;
            if (chip) log(state.frame, 'weapon-chip', owner.id, target.id, chip);
          }
        }
        if (owner.health <= 0) item.owner = '';
      }
      if (item.owner || item.projectileOwner) delete item.terrainContact;
      if (!item.projectileOwner) {
        if (!item.owner && item.durability > 0 && options.surface) {
          if (stepLooseWeapon(item, options.surface, !!definition.weapons.find(weapon => weapon.entityId === item.id)?.restPose)) log(state.frame, 'weapon-dropped', item.id, item.id, 0, item.position);
          if (item.position.y < -1000) { item.durability = 0;item.velocity = zero();log(state.frame, 'weapon-lost', '', item.id); }
        }
        continue;
      }
      const previous = { ...item.position };
      item.position.x += item.velocity.x / 60;item.position.y += item.velocity.y / 60;item.position.z += item.velocity.z / 60;item.velocity.y -= 0.1635;
      const surface = options.surface?.(previous, item.position);
      if (surface) { item.position = surface.position;item.projectileOwner = '';item.velocity = zero();if ((surface.normal?.y ?? 1) > .5) item.terrainContact = { ...surface.position };log(state.frame, 'weapon-dropped', item.id, item.id, 0, item.position);wear(item, ['single-use', 'ground'].includes(definition.weapons.find(weapon => weapon.entityId === item.id)!.kit ?? '') ? item.durability : 6, state.frame, surface.id);continue; }
      for (const target of state.fighters) {
        if (target.id === item.projectileOwner || target.health <= 0 || target.protectionFrames) continue;
        const dx = item.position.x - previous.x, dy = item.position.y - previous.y, dz = item.position.z - previous.z;
        const t = Math.max(0, Math.min(1, ((target.position.x - previous.x) * dx + (target.position.y - previous.y) * dy + (target.position.z - previous.z) * dz) / Math.max(.00001, dx * dx + dy * dy + dz * dz)));
        if (hypot(previous.x + dx * t - target.position.x, previous.y + dy * t - target.position.y, previous.z + dz * t - target.position.z) > config.hurtRadius + .2) continue;
        const source = item.projectileOwner, input = inputs.find(input => input.fighterId === target.id);
        const vx = previous.x - target.position.x, vz = previous.z - target.position.z;
        const frontal = vx * target.facing.x + vz * target.facing.z >= cos((config.guardArcDegrees ?? 180) * Math.PI / 360) * hypot(vx, vz) * hypot(target.facing.x, target.facing.z);
        const parryWindow = input?.guardFresh || target.guardStarted >= 0 && state.frame - 1 - target.guardStarted < config.parryFrames;
        if (parryWindow && target.guarding && !target.guardBrokenFrames && (target.stunKind === '' || target.stunKind === 'block') && !target.moveId && frontal) {
          item.projectileOwner = target.id;item.velocity.x *= -1;item.velocity.z *= -1;
          target.stamina = Math.min(config.maxStamina ?? 0, target.stamina + (config.parryStaminaRestore ?? 0));
          target.guardMeter = Math.min(config.maxGuard ?? 0, target.guardMeter + (config.maxGuard ?? 0) * (config.parryGuardRestore ?? .25));
          target.followupFrames = config.parryFollowupFrames ?? 18;target.history = [];target.stunFrames = 0;target.stunKind = '';
          const chip = Math.min(Math.max(0, target.health - 1), .8);
          target.health -= chip;
          events.push(event(state, source, target.id, 'parry', chip, zero(), 'fresh-parry'));log(state.frame, 'projectile-deflected', target.id, item.id);break;
        }
        const blocked = target.guarding && !target.guardBrokenFrames && !target.moveId && frontal && (target.stunKind === '' || target.stunKind === 'block');
        const reason = blocked ? 'held-block' : !target.guarding ? 'guard-not-held' : target.guardBrokenFrames ? 'guard-broken' : target.moveId ? 'attack-commitment' : target.stunKind === 'hit' ? 'hit-recoil' : target.stunKind === 'parry' ? 'parry-recoil' : 'outside-guard-arc';
        const damage = Math.min(blocked ? Math.max(0, target.health - 1) : target.health, blocked ? 2 : 8);
        target.health -= damage;target.stunFrames = blocked ? 10 : definition.projectileHitstunFrames ?? 18;target.stunKind = blocked ? 'block' : 'hit';
        if (!blocked) { target.moveId = '';target.moveFrame = 0;target.charging = false;target.history = []; }
        if (blocked && (config.maxGuard ?? 0) > 0) { target.guardMeter = Math.max(0, target.guardMeter - 8);if (!target.guardMeter) { target.guardBrokenFrames = config.guardBreakFrames ?? 600;target.guarding = false; } }
        events.push({ ...event(state, source, target.id, blocked ? target.guardBrokenFrames ? 'guard-break' : 'block' : 'hit', damage, { x: item.velocity.x * .2, y: 0, z: item.velocity.z * .2 }, reason), ...(!blocked ? { hitstunFrames: definition.projectileHitstunFrames ?? 18 } : {}) });
        log(state.frame, 'projectile-contact', source, target.id, damage);wear(item, ['single-use', 'ground'].includes(definition.weapons.find(weapon => weapon.entityId === item.id)!.kit ?? '') ? item.durability : 6, state.frame, target.id);item.projectileOwner = '';item.velocity = zero();break;
      }
      if (item.position.y < -1000) { item.durability = 0;item.projectileOwner = '';item.velocity = zero();log(state.frame, 'weapon-lost', '', item.id); }
    }
    for (const fighter of state.fighters) if (brokenOwners.has(fighter.id)) { fighter.moveId = '';fighter.charging = false;fighter.moveFrame = 0;fighter.history = []; }
    brokenOwners.clear();
  }
  function validate(value: unknown): Saved {
    if (value === undefined) return structuredClone(initial);
    if (!value || typeof value !== 'object') throw new Error('Invalid interaction snapshot.');
    const data = readCombatInteractionState3D(value);
    if (!Array.isArray(data.weapons) || data.weapons.length !== initial.weapons.length || !Array.isArray(data.grapples) || data.grapples.length > options.fighterIds.length || !Array.isArray(data.trace) || data.trace.length > 128 || !data.lastAttacks || typeof data.lastAttacks !== 'object') throw new Error('Invalid interaction state.');
    const seen = new Set<string>(), owners = new Set<string>();
    for (const item of data.weapons) {
      const original = initial.weapons.find(original => original.id === item.id);
      if (!original || seen.has(item.id) || item.owner && (!options.fighterIds.includes(item.owner) || owners.has(item.owner)) || item.projectileOwner && !options.fighterIds.includes(item.projectileOwner)
        || !Number.isFinite(item.durability) || item.durability < 0 || item.durability > original.durability || !Number.isFinite(item.length) || item.length <= 0 || item.length > original.length
        || typeof item.owner !== 'string' || typeof item.projectileOwner !== 'string' || item.owner && item.projectileOwner || item.durability === 0 && (item.projectileOwner || item.owner && item.spentSerial === undefined)
        || item.active !== undefined && typeof item.active !== 'boolean' || item.active === false && (item.owner || item.projectileOwner)
        || !Number.isSafeInteger(item.serial) || item.serial < 0 || !vectorValid(item.position) || !vectorValid(item.velocity) || item.terrainContact !== undefined && !vectorValid(item.terrainContact)) throw new Error('Invalid saved weapon.');
      const declaration = definition.weapons.find(weapon => weapon.entityId === item.id)!;
      if (item.ammo !== undefined && (declaration.kit !== 'spray' || !Number.isInteger(item.ammo) || item.ammo < 0 || item.ammo > (declaration.ammo ?? 0))
        || item.spentSerial !== undefined && (!['single-use', 'ground'].includes(declaration.kit ?? '') || !Number.isSafeInteger(item.spentSerial) || item.spentSerial <= 0 || item.durability !== 0)
        || item.effectSerial !== undefined && (!Number.isSafeInteger(item.effectSerial) || item.effectSerial <= 0 || declaration.kit !== 'ground')) throw Error('Invalid saved utility weapon.');
      if (declaration.ammo !== undefined && item.ammo === undefined) item.ammo = declaration.ammo;
      seen.add(item.id);if (item.owner) owners.add(item.owner);
    }
    const grappling = new Set<string>();
    for (const grapple of data.grapples) {
      if (!grapple || !options.fighterIds.includes(grapple.attacker) || !options.fighterIds.includes(grapple.target) || grapple.attacker === grapple.target || grappling.has(grapple.attacker) || grappling.has(grapple.target) || !Number.isInteger(grapple.remaining) || grapple.remaining <= 0 || grapple.remaining > (definition.grappleTechFrames ?? 12) || !vectorValid(grapple.direction) || hypot(grapple.direction.x, grapple.direction.z) > 1.000001 || grapple.direction.y !== 0) throw new Error('Invalid saved grapple.');
      grappling.add(grapple.attacker);grappling.add(grapple.target);
    }
    if (data.attempts !== undefined && (!Array.isArray(data.attempts) || data.attempts.length > options.fighterIds.length)) throw Error('Invalid saved grab startup.');
    const attempting = new Set<string>();
    for (const attempt of data.attempts ?? []) {
      if (!attempt || !options.fighterIds.includes(attempt.attacker) || attempting.has(attempt.attacker) || grappling.has(attempt.attacker) || !Number.isInteger(attempt.remaining) || attempt.remaining <= 0 || attempt.remaining > (definition.grappleStartupFrames ?? 0) || !vectorValid(attempt.direction) || hypot(attempt.direction.x, attempt.direction.z) > 1.000001 || attempt.direction.y !== 0) throw Error('Invalid saved grab startup.');
      attempting.add(attempt.attacker);
    }
    for (const entry of data.trace) if (!entry || !Number.isSafeInteger(entry.frame) || entry.frame < 0 || typeof entry.kind !== 'string' || typeof entry.actor !== 'string' || typeof entry.target !== 'string' || [entry.kind, entry.actor, entry.target].some(value => value.length > 160) || !Number.isFinite(entry.value) || entry.position !== undefined && !vectorValid(entry.position)) throw new Error('Invalid interaction trace.');
    for (const [id, serial] of Object.entries(data.lastAttacks)) if (!options.fighterIds.includes(id) || !Number.isSafeInteger(serial) || serial < 0) throw new Error('Invalid interaction attack serial.');
    validateWeaponEffects(data, definition, options.fighterIds);
    return data;
  }
  return { before, after, get transitions() { return transitions; }, capture: () => structuredClone(saved), validate, restore(value: Saved) { saved = structuredClone(value);transitions = []; }, reset(positions?: ReadonlyMap<string, CombatVector>, activeWeaponIds?: ReadonlySet<string>) { saved = structuredClone(initial);for (const item of saved.weapons) { const position = positions?.get(item.id);if (position) item.position = { ...position };if (activeWeaponIds) item.active = activeWeaponIds.has(item.id); }transitions = []; },
    movementScales(state: CombatSnapshot, grounded: ReadonlySet<string>) { return weaponMovementScales(saved, state, grounded, options.surface); },
    attackVisibility(from: CombatVector, to: CombatVector) { return !options.surface?.(from, to); },
    arcDegrees(state: CombatSnapshot, inputs: readonly CombatInput[]) {
      const arcs: Record<string, number> = {};
      for (const item of saved.weapons) {
        if (!item.owner || item.active === false) continue;
        const weapon = definition.weapons.find(weapon => weapon.entityId === item.id)!;
        if (weapon.kit !== 'spray' || !weapon.effect) continue;
        const actor = state.fighters.find(fighter => fighter.id === item.owner)!;
        const heavy = config.moves.find(move => move.id === weapon.heavyMoveId)!;
        const input = inputs.find(input => input.fighterId === item.owner);
        if (actor.moveId === heavy.id || !actor.moveId && input?.pressed?.includes(heavy.command[0]!) && (item.ammo ?? 0) > 0) arcs[item.owner] = weapon.effect.arcDegrees ?? 65;
      }
      return arcs;
    },
    techWindow(fighterId: string) {
      const grapple = saved.grapples.find(grapple => grapple.target === fighterId);
      return grapple && grapple.remaining > 1 ? { attacker: grapple.attacker, remaining: grapple.remaining - 1, total: definition.grappleTechFrames ?? 12 } : undefined;
    },
    observedWeapons() {
      return saved.weapons.filter(item => item.active !== false && item.durability > 0 && (item.owner || item.projectileOwner)).map(item => {
        const weapon = definition.weapons.find(weapon => weapon.entityId === item.id)!;
        return { owner: item.owner, projectileOwner: item.projectileOwner, position: { ...item.position }, velocity: { ...item.velocity }, length: item.length, lightMoveId: weapon.lightMoveId, heavyMoveId: weapon.kit === 'spray' && item.ammo === 0 || weapon.kit === 'single-use' || weapon.kit === 'ground' ? weapon.lightMoveId : weapon.heavyMoveId, kit: weapon.kit };
      });
    },
    selectedTarget(state: CombatSnapshot, fighterId: string, direction?: CombatVector) {
      const actor = state.fighters.find(fighter => fighter.id === fighterId);
      if (!actor || actor.health <= 0 || actor.stunFrames || actor.moveId || saved.weapons.some(item => item.owner === fighterId)) return undefined;
      return selectedCandidate(candidatesFor(state, actor, direction && hypot(direction.x, direction.z) > .1 ? direction : actor.facing))?.id;
    },
    aiPickupDirection(state: CombatSnapshot, fighterId: string, targetId: string) {
      const actor = state.fighters.find(fighter => fighter.id === fighterId)!, target = state.fighters.find(fighter => fighter.id === targetId)!;
      if (actor.health <= 0 || actor.stunFrames || actor.moveId || state.frame % 30 || saved.weapons.some(item => item.owner === fighterId)) return undefined;
      if (hypot(actor.position.x - target.position.x, actor.position.z - target.position.z) < (definition.grappleRange ?? 1.8) + config.hurtRadius) return undefined;
      for (const item of [...saved.weapons].sort((a, b) => hypot(a.position.x - actor.position.x, a.position.z - actor.position.z) - hypot(b.position.x - actor.position.x, b.position.z - actor.position.z))) {
        if (item.active === false || item.owner || item.projectileOwner || item.durability <= 0) continue;
        const x = item.position.x - actor.position.x, z = item.position.z - actor.position.z, length = hypot(x, z);
        const direction = length > .1 ? { x: x / length, y: 0, z: z / length } : actor.facing;
        if (selectedCandidate(candidatesFor(state, actor, direction))?.id === item.id) return direction;
      }
      return undefined;
    },
    aiPress(state: CombatSnapshot, fighterId: string, targetId: string, techOnly = false, direction?: CombatVector, allowPickup = true) {
      const actor = state.fighters.find(fighter => fighter.id === fighterId)!, target = state.fighters.find(fighter => fighter.id === targetId)!;
      const grapple = saved.grapples.find(grapple => grapple.target === fighterId);
      // Delayed observations can miss the window; never clamp a late AI response
      // back into a guaranteed last-frame tech unavailable to a human.
      if (grapple) return false; // AI observes techWindow through its ordinary reaction queue.
      if (techOnly) return false;
      if (actor.moveId || actor.stunFrames || actor.health <= 0 || state.frame % 30) return false;
      const distance = hypot(actor.position.x - target.position.x, actor.position.z - target.position.z);
      if (saved.weapons.some(item => item.owner === fighterId)) return distance > 3 && distance < 7;
      const selected = selectedCandidate(candidatesFor(state, actor, direction && hypot(direction.x, direction.z) > .1 ? direction : actor.facing));
      return !!selected && (selected.weapon ? allowPickup : selected.id === targetId && target.guarding);
    },
    reachScales(state: CombatSnapshot, inputs: readonly CombatInput[]) { return Object.fromEntries(saved.weapons.filter(item => item.owner).map(item => {
      const actor = state.fighters.find(fighter => fighter.id === item.owner)!;
      const input = inputs.find(input => input.fighterId === item.owner);
      const weapon = definition.weapons.find(weapon => weapon.entityId === item.id)!;
      // A buffered or rejected press cannot change the reach of the committed strike.
      // In particular Drive is shared with the unarmed wheel command.
      const current = config.moves.find(move => move.id === actor.moveId);
      const move = current ?? config.moves.find(move => input?.pressed?.includes(move.command[0]!) && move.command.length === 1
        && [weapon.lightMoveId, weapon.heavyMoveId].includes(move.weaponBaseMoveId ?? move.id));
      const reach = weapon.kit === 'ground' ? .01 : weapon.kit === 'spray' && move?.id === weapon.heavyMoveId ? weapon.effect?.range ?? move.reach : weapon.kit && weapon.kit !== 'combat' ? move?.reach ?? item.length : item.length;
      return [item.owner, reach / Math.max(.01, move?.reach ?? 1)];
    })); } };
}

import { createFrameRecordSelection, readCombatProject3D, type GameplaySnapshot3D, type Hyperfocus3DRuntime, type Hyperfocus3DEvaluatedFrame, type PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';
import { createActionController } from '../actions/runtime.ts';
import { presentArtWeapon } from '../actions/present-weapon.ts';
import { weaponGrip } from '../actions/weapons.ts';
import { createLocomotionClock } from '../locomotion.ts';
import { sampleUniversalCombat } from '../universal-combat.ts';
import { sampleUniversalLocomotion, universalLocomotionProfile } from '../universal-locomotion.ts';
import { createArtMotionTransition } from '../transition.ts';
import { presentArtFighter } from '../pose.ts';
import { createRigFrameLookup, type RigFrameLookup, type RigPreparation, type RigPreparationWork } from '../rig-preparation.ts';
import { cityWeapon } from '../../city/weapons/catalogue.ts';
import { readDirectedFighters } from './contract.ts';
import { readDirectedBank } from './bank.ts';
import { directedGrounded } from './ground.ts';
import { bridgeDirectedWardrobe } from './wardrobe.ts';
import { presentDirectedKnockout } from './knockout.ts';
import { presentFighterExpression } from './expression.ts';
import { createCosmeticEmitter, presentCosmeticParticles } from '../../cosmetics/particles.ts';
import { presentFighterFeedback } from '../../feedback/fighter.ts';
import { presentCombatFeedback } from '../../feedback/particles.ts';
import { presentFireFeedback } from '../../feedback/fire.ts';
export type WardrobeStylePreview = { channel: 'movement' | 'hit' | 'particles' | 'recovery'; style: string; progress: number; tick?: number; reducedMotion: boolean };
import type { AppearanceStyle3D } from '@hyperfocus/engine/project/runtime-3d';

/** Host-owned presentation, shared by editor Play and exported/offline gameplay. */
export function createDirectedFighterPresenter(options: { project: { extensions?: Record<string, unknown> }; runtime: Hyperfocus3DRuntime; assets: readonly PortableAsset3D[]; rigPreparation?: RigPreparation; rigWork?: RigPreparationWork }) {
  const rigPreparation = options.rigPreparation ?? 'original', rigWork = options.rigWork;
  if (rigPreparation !== 'original' && rigPreparation !== 'prepared') throw Error('Unsupported rig preparation strategy');
  const { runtime } = options, definition = readDirectedFighters(options.project, runtime.declaration);
  if (!definition) return undefined;
  const combat = readCombatProject3D(options.project.extensions?.hyperfocusCombat)!;
  const asset = options.assets.find(asset => asset.id === definition.bankAssetId);
  if (!asset) throw new Error('Directed fighter motion bank is missing.');
  const bank = readDirectedBank(asset.bytes);
  // Runtime declarations fix membership. Rebind live evaluated records each call;
  // each helper can search its small presentation subset without walking the city.
  const authored = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities;
  const authoredById = new Map(authored.map(entity => [entity.id, entity]));
  const weapons = new Set(combat.interactions?.weapons.map(weapon => weapon.entityId));
  const select = createFrameRecordSelection({ ids: authored.filter(entity => weapons.has(entity.id)
    || definition.fighters.some(fighter => entity.id === fighter.entityId || entity.id.startsWith(`${fighter.entityId}:`) || entity.id.startsWith(`${fighter.rigId}:`))).map(entity => entity.id) });
  const selectedFrame = (frame: Hyperfocus3DEvaluatedFrame) => ({ ...frame, entities: select(frame.entities) });
  const memories = new Map<string, ReturnType<typeof memory>>();
  const cosmetics = runtime.declaration.meshes.some(mesh => mesh.id === 'tod:directed:cosmetic-stroke');
  const expressions = runtime.declaration.meshes.some(mesh => mesh.id.includes(':cosmetic-native-hair-'));
  function memory() { return { clock: createLocomotionClock(speed => universalLocomotionProfile(bank, speed).stride), controller: createActionController(), transition: createArtMotionTransition(), particles: createCosmeticEmitter(), tick: -1, position: [0, 0, 0], yaw: 0, health: 100, impactTick: -1 }; }
  const measurements: Array<{ id: string; action: string; grounded: boolean; joints: ReturnType<typeof presentArtFighter>; weaponId?: string; hand?: string }> = [];
  return {
    measurements,
    /** Discontinuity boundary: no locomotion, pose-transition or particle history
     * may leak from the world that preceded a seeded checkpoint restore. */
    reset() { memories.clear();measurements.length = 0; },
    validateCapture(frame: Hyperfocus3DEvaluatedFrame, snapshot: GameplaySnapshot3D) {
      for (const binding of definition.fighters) {
        if (!snapshot.combat?.knockout.some(rig => rig.id === binding.entityId)) continue;
        for (const suffix of ['head', 'left-hand', 'right-hand']) {
          const physical = frame.entities.find(entity => entity.id === `${binding.entityId}:${suffix}`);
          const rendered = frame.entities.find(entity => entity.id === `${binding.rigId}:${suffix}`);
          if (!physical || !rendered?.visible || Math.hypot(...rendered.position.map((value, axis) => value - physical.position[axis]!)) > .02) throw Error(`Capture fighter ${binding.entityId} is detached from its native knockout/recovery pose.`);
        }
      }
    },
    preview(wholeFrame: Hyperfocus3DEvaluatedFrame, actorId: string, gesture?: { style: 'default' | 'bow' | 'salute' | 'fists-up'; settle: number }, style?: WardrobeStylePreview) {
      const frame = selectedFrame(wholeFrame);
      const binding = definition.fighters.find(fighter => fighter.entityId === actorId);
      if (!binding) return;
      const pose = sampleUniversalCombat(bank, { kind: 'idle', frame: 0 });
      if (gesture?.style === 'bow') { pose.pitch += .5 * gesture.settle; pose.head!.pitch += .3 * gesture.settle; }
      if (gesture?.style === 'salute') { pose.right = [.15, 1.81, .16]; pose.elbows = { left: [-.35, 1.25, .1], right: [.49, 1.50, .07] }; }
      if (gesture?.style === 'fists-up') { pose.left = [-.3, 1.9, .13]; pose.right = [.3, 1.9, .13]; pose.elbows = { left: [-.51, 1.56, .07], right: [.51, 1.56, .07] }; }
      presentArtFighter({ frame, declaration: runtime.declaration, bindPose: binding.rest, id: binding.rigId, root: [0, 0, 0], yaw: 0, motion: pose });
      for (const entity of frame.entities) if (entity.id.startsWith(`${binding.rigId}:flexible:`)) entity.visible = false;
      bridgeDirectedWardrobe(frame, runtime.declaration, binding);
      if(expressions)presentFighterExpression(frame,binding.rigId,'neutral');
      if (cosmetics) {
        for (const entity of frame.entities) if (entity.id.startsWith(`${actorId}:trail:`)) entity.visible = false;
        const tick = style?.tick ?? Math.floor((style?.progress ?? 1) * 108), active = style?.channel === 'particles';
        presentCosmeticParticles(frame, actorId, active ? style.style : 'classic', active ? [{ tick: Math.floor(tick / 30) * 30, point: [.30, .015, .34], direction: [0, 0, 1], kind: 'step' }] : [], tick, style?.reducedMotion);
      }
    },
    present(wholeFrame: Hyperfocus3DEvaluatedFrame, snapshot: GameplaySnapshot3D, presentation?: { styles?: (AppearanceStyle3D & { actorId: string })[]; reducedMotion?: boolean }) {
      if (!snapshot.combat) return;
      const frame = selectedFrame(wholeFrame);
      // No callbacks or membership/ID writers occur between these built-in
      // standing stages. Drop the lookup when this invocation returns/throws.
      let rigLookup: RigFrameLookup | undefined;
      const state = snapshot.combat.state, grounded = directedGrounded(runtime, definition.fighters.map(fighter => fighter.entityId));
      measurements.length = 0;
      for (const binding of definition.fighters) {
        const fighter = state.fighters.find(fighter => fighter.id === binding.entityId), entity = frame.entities.find(entity => entity.id === binding.entityId);
        if (!fighter || !entity) continue;
        if (fighter.health <= 0 && snapshot.combat.knockout.some(rig => rig.id === fighter.id)) {
          if (rigWork) rigWork.knockoutFighters++;
          const joints = presentDirectedKnockout(frame, binding);
          bridgeDirectedWardrobe(frame, runtime.declaration, binding, undefined, rigWork);
          if(expressions)presentFighterExpression(frame,binding.rigId,'knockout',1,false,undefined,rigWork);
          for (const part of frame.entities) if (part.id.startsWith(`${binding.rigId}:flexible:`)) part.visible = false;
          memories.delete(fighter.id);
          measurements.push({ id: fighter.id, action: 'knockout', grounded: grounded.has(fighter.id), joints });
          continue;
        }
        if (rigPreparation === 'prepared') rigLookup ??= createRigFrameLookup(frame, rigWork);
        if (rigWork) rigWork.standingFighters++;
        const physical = snapshot.entities.find(entity => entity.id === fighter.id)!, position = physical.position;
        let previous = memories.get(fighter.id);
        const teleport = previous && Math.hypot(position[0] - previous.position[0]!, position[2] - previous.position[2]!) > 3;
        if (!previous || state.frame < previous.tick || teleport) { previous = memory(); previous.position = [...position]; previous.yaw = Math.atan2(fighter.facing.x, fighter.facing.z); memories.set(fighter.id, previous); }
        const supported = grounded.has(fighter.id), native = snapshot.combat.motion?.find(motion => motion.id === fighter.id);
        if (state.frame !== previous.tick) {
          const elapsed = previous.tick < 0 ? 1 : Math.max(1, state.frame - previous.tick), dx = position[0] - previous.position[0]!, dz = position[2] - previous.position[2]!, distance = Math.hypot(dx, dz);
          const enabled = supported && !fighter.moveId && !fighter.stunFrames && !native?.dash;
          // Preserve the reviewed restrained pose. Native sprint speed is presentation
          // travel; cadence is bounded so fast movement cannot become a leg flutter.
          for (let i = 0; i < Math.min(elapsed, 8); i++) previous.clock.advance(Math.min(distance / elapsed, .08), enabled);
          const moving = previous.clock.snapshot().weight > .01;
          const target = (enabled && moving && !native?.locked || native?.wallRunning) && distance > .001 ? Math.atan2(dx, dz) : Math.atan2(fighter.facing.x, fighter.facing.z);
          const turn = Math.atan2(Math.sin(target - previous.yaw), Math.cos(target - previous.yaw));
          previous.yaw += Math.max(-.18 * elapsed, Math.min(.18 * elapsed, turn * .25));
          previous.position = [...position]; previous.tick = state.frame;
        }
        const locomotion = previous.clock.snapshot(), moving = locomotion.weight > .01;
        const gait = moving ? sampleUniversalLocomotion(bank, { cycle: locomotion.cycle, speed: locomotion.poseSpeed, weight: locomotion.weight }) : sampleUniversalCombat(bank, { kind: 'idle', frame: state.frame });
        const wall = native?.wallId ? wholeFrame.entities.find(entity => entity.id === native.wallId) : undefined, yaw = previous.yaw;
        const wallSide = wall ? (wall.position[0] - position[0]) * Math.cos(yaw) - (wall.position[2] - position[2]) * Math.sin(yaw) : -1;
        const held = snapshot.combat.interactions?.weapons.find(item => item.owner === fighter.id);
        const heldDefinition = combat.interactions?.weapons.find(item => item.entityId === held?.id);
        const heldModel = held ? authoredById.get(held.id) : undefined;
        const legacyStaff = heldDefinition?.lightMoveId === 'weapon-staff-light' && heldModel
          ? { ...cityWeapon('long-pipe'), width: Math.abs(heldModel.scale[0]) * 2, length: Math.abs(heldModel.scale[1]) * 2, depth: Math.abs(heldModel.scale[2]) * 2 } : undefined;
        const selected = previous.controller.sample({ snapshot, id: fighter.id, bank, config: combat.config, gait, moving, yaw, wallSide, grounded: supported, weapon: legacyStaff, velocityY: runtime.physics.body(fighter.id)?.velocityY ?? 0 });
        const impact = fighter.health < previous.health; previous.health = fighter.health;
        if (impact) previous.impactTick = state.frame;
        const key = fighter.moveId ? `${fighter.moveId}:${fighter.attackSerial}` : `${selected.id}:${fighter.stunKind}`;
        let pose = previous.transition.sample({ pose: selected.pose, key, tick: state.frame, frames: impact ? 3 : fighter.moveId ? 4 : 8, impact });
        const weapon = selected.weapon;
        if (weapon && pose.weapon) { pose = structuredClone(pose); weaponGrip(pose, weapon, pose.weapon!.axis); }
        const root: [number, number, number] = [position[0], position[1] - binding.rootHeight, position[2]];
        const joints = presentArtFighter({ frame, declaration: runtime.declaration, bindPose: binding.rest, id: binding.rigId, root, yaw, motion: pose, preparation: rigPreparation, lookup: rigLookup, work: rigWork });
        for (const entity of frame.entities) if (entity.id.startsWith(`${binding.rigId}:flexible:`)) entity.visible = false;
        if (weapon && held) presentArtWeapon({ frame, entityId: held.id, wrist: joints[pose.weapon?.hand === 'left' ? 0 : 1]!.wrist, root, yaw, pose, weapon, flexiblePrefix: `${binding.rigId}:flexible` });
        bridgeDirectedWardrobe(frame, runtime.declaration, binding, rigLookup, rigWork);
        if(expressions) {
          const move=combat.config.moves.find(move=>move.id===fighter.moveId);
          const remaining=move?move.startupFrames+move.activeFrames+move.recoveryFrames-fighter.moveFrame:0;
          const effort=fighter.stunFrames?Math.min(1,fighter.stunFrames/8):move?Math.max(0,Math.min(1,fighter.moveFrame/6,remaining/10)):1;
          presentFighterExpression(frame,binding.rigId,fighter.stunFrames?'hurt':move?'exertion':'neutral',effort,!!held,rigLookup,rigWork);
        }
        if (cosmetics) {
          const foot = [...joints].sort((a, b) => a.foot[1]! - b.foot[1]!)[0]!.foot;
          previous.particles.step({ tick: state.frame, point: [...position], foot: [foot[0], root[1] + .012, foot[2]], grounded: supported, dash: !!native?.dash, enabled: fighter.health > 0 && !fighter.stunFrames });
          const style = presentation?.styles?.find(style => style.actorId === fighter.id && style.channel === 'particles')?.style ?? 'classic';
          presentCosmeticParticles(frame, fighter.id, style, previous.particles.events, state.frame, presentation?.reducedMotion);
          // Generic trails double up movement dust. Keep the pool for its gameplay signals only.
          if (!fighter.moveId && !fighter.protectionFrames && !native?.dashCue && !native?.wallRunning && !native?.wallSliding && !snapshot.combat.defenseFeedback?.some(cue => cue.id === fighter.id && cue.cue && state.frame - cue.cue.frame < 30)) {
            for (const entity of frame.entities) if (entity.id.startsWith(`${fighter.id}:trail:`)) entity.visible = false;
          }
        }
        const fire = snapshot.combat.environment?.hazards?.contacts.some(contact => contact.fighterId === fighter.id && contact.active && combat.environment?.hazards?.some(hazard => hazard.entityId === contact.entityId && hazard.kind === 'fire')) ?? false;
        presentFighterFeedback({ frame, fighter, rigId: binding.rigId, hitstop: snapshot.combat.hitstop.remaining,
          hit: previous.impactTick === state.frame || fighter.stunKind === 'hit' && fighter.stunFrames > 0,
          heavy: selected.id !== 'hit-light', fire, reducedMotion: presentation?.reducedMotion, heldId: held?.id, authored: authoredById });
        measurements.push({ id: fighter.id, action: selected.id, grounded: supported, joints, weaponId: held?.id, hand: pose.weapon?.hand });
      }
      presentCombatFeedback(frame, snapshot, presentation?.reducedMotion);
      presentFireFeedback({ frame: wholeFrame, combat, declaration: runtime.declaration, reducedMotion: presentation?.reducedMotion });
    },
  };
}

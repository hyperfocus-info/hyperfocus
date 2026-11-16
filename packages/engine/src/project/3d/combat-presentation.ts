import type { createCombatSimulation } from '../../combat/simulation.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../frame/3d.ts';
import type { Hyperfocus3DRuntime } from '../runtime-3d.ts';
import type { ResolvedAppearancePose3D, ResolvedAppearance3D } from './appearance/catalog.ts';
import type { createCombatEnvironment } from './combat-environment/session.ts';
import { createCombatEnvironmentPresenter } from './combat-environment/presentation.ts';
import { presentCombatHazards } from './combat-environment/hazards/presentation.ts';
import type { createTrafficWheelPresenter } from './combat-environment/vehicles/wheels.ts';
import type { createCombatInteractions } from './combat-interaction/session.ts';
import { createCombatInteractionPresenter } from './combat-interaction/presentation.ts';
import type { createCombatKnockout3D } from './combat-knockout/index.ts';
import type { createCombatMatch3D } from './combat-match/index.ts';
import { combatRoundStandingTargets } from './combat-match/round-recovery.ts';
import type { createCombatMotion3D } from './combat-motion.ts';
import type { createCombatVisualPresenter3D } from './combat-visuals/actors/primitive-presenter.ts';
import { presentCombatCamera3D, type CombatCameraOrbit3D } from './combat-visuals/camera.ts';
import { clearBoundCombatCameraSurfaces } from './combat-visuals/camera-clearance.ts';
import { cutawaySceneBindings, type CutawayTopologyWork3D } from './combat-visuals/cutaways/scene-bindings.ts';
import type { createCutawayFade } from './combat-visuals/cutaways/cutaway-fade.ts';
import { presentCombatDash3D } from './combat-visuals/dash-feedback.ts';
import type { createDefenseFeedback3D } from './combat-visuals/defense-feedback.ts';
import type { createCombatLocomotionEffects3D } from './combat-visuals/locomotion-effects.ts';
import { presentBoundCombatObstructions3D } from './combat-visuals/obstructions.ts';
import type { createCombatRoundRecovery3D } from './combat-visuals/round-recovery.ts';
import { presentWeaponUtilities } from './combat-visuals/weapons/utility-effects.ts';
import type { CombatEvent, CombatSnapshot } from '../../combat/state.ts';
import { combatMoveDuration } from '../../combat/combo/timing.ts';
import type { CombatProject3D } from './combat-declaration.ts';
import type { GameplayPresentation3D } from './gameplay-contracts.ts';
import { capturePresentationComponent, type CombatPresentationCapture3D, type PresentationCaptureWork } from './presentation-capture.ts';

export function combatPresentation3D(options: { state: CombatSnapshot; definition: CombatProject3D; events?: readonly CombatEvent[] }): GameplayPresentation3D {
  const { state, definition } = options, { config } = definition;
  const player = definition.fighters.find(item => item.control === 'player');
  const local = state.fighters.find(item => item.id === player?.entityId);
  const advanced = config.guardBreakFrames !== undefined;
  const names: Record<string, string> = { jab: 'Strike', heavy: 'Heavy', flurry: 'Flurry', escape: 'Armored escape', evade: 'Evade', followup: 'Quick reply', sidestep: 'Sidestep', feint: 'Feint', evasive: 'Evasive strike' };
  const current = config.moves.find(move => move.id === local?.moveId);
  const counter = options.events?.some(event => event.counter && state.frame - event.frame < 14);
  const launched = state.fighters.find(fighter => fighter.id !== local?.id && fighter.health > 0 && fighter.stunKind === 'hit' && fighter.position.y > (local?.position.y ?? 0) + 1);
  const directionName = current?.direction === 'toward' ? 'Advancing ' : current?.direction === 'away' ? 'Retreating ' : current?.direction === 'side' ? 'Side ' : '';
  const moveName = current?.id === 'drive-heavy-toward' ? 'Diving kick' : current?.id === 'drive-heavy-away' ? 'Windmill lunge' : current?.id === 'heavy-away' ? 'Armored forward kick' : current ? `${directionName}${current.stringOnly ? 'follow-up ' : ''}${names[current.command.at(-1) ?? ''] ?? current.id}` : '';
  const followup = current?.cancels.some(link => (!link.hitOnly || local?.hitConfirmed) && !config.moves.find(move => move.id === link.moveId)?.special && (local?.moveFrame ?? 0) >= link.fromFrame && (local?.moveFrame ?? 0) <= link.toFrame);
  const metrics: NonNullable<GameplayPresentation3D['metrics']> = [];
  for (const fighter of state.fighters.slice(0, advanced ? 2 : 8)) {
    const name = fighter.id === player?.entityId ? 'You' : 'Opponent';
    metrics.push({ label: `${name} · health`, value: `${fighter.health} HP / ${config.maxHealth}`, current: fighter.health, max: config.maxHealth });
    if (advanced) {
      const broken = fighter.guardBrokenFrames > 0;
      metrics.push({ label: `${name} · guard`, value: broken ? `Broken · ${(fighter.guardBrokenFrames / 60).toFixed(1)}s` : `${fighter.guardMeter} / ${config.maxGuard}`, current: broken ? 0 : fighter.guardMeter, max: config.maxGuard ?? 100 });
      metrics.push({ label: `${name} · escape`, value: fighter.escapeCharges > 0 ? 'Ready' : 'Spent until restart' });
      if (config.maxStamina) metrics.push({ label: `${name} · stamina`, value: `${Math.floor(fighter.stamina)} / ${config.maxStamina}`, current: fighter.stamina, max: config.maxStamina });
    }
  }
  const actions: NonNullable<GameplayPresentation3D['actions']> = [];
  if (player) {
    const commands = new Set<string>();
    for (const move of config.moves.filter(item => !item.stringOnly && (!item.parryFollowup || (local?.followupFrames ?? 0) > 0))) {
      const command = move.command.at(-1);
      if (!command || commands.has(command) || actions.length >= (config.maxStamina ? 6 : 8)) continue;
      commands.add(command);
      actions.push({ action: `${player.actionPrefix}${command}`, label: names[move.id] ?? move.id, disabled: move.armoredEscape && !local?.escapeCharges });
    }
    if (config.maxStamina) actions.push({ action: `${player.actionPrefix}drive`, label: 'Hold Drive', held: true });
    actions.push({ action: `${player.actionPrefix}guard`, label: 'Hold guard · tap to parry', held: true, disabled: (local?.guardBrokenFrames ?? 0) > 0 });
    if (advanced) actions.push({ action: `${player.actionPrefix}tech`, label: 'Tech impact' });
    if (definition.interactions) actions.push({ action: `${player.actionPrefix}interact`, label: 'Grapple / pick up / throw' });
    actions.push({ action: `${player.actionPrefix}reset`, label: 'Restart' });
  }
  const status = state.fighters.some(item => item.health <= 0) ? 'Knockout. Restart for a fresh round.'
    : local?.guardBrokenFrames ? `Guard broken · ${(local.guardBrokenFrames / 60).toFixed(1)}s. Move, evade or use your escape.`
    : local?.followupFrames ? 'Perfect parry · choose your reply!'
    : local?.armorFrames ? 'Armored swing · you can still take damage.'
    : counter ? 'Counter · caught the attack!'
    : local?.stunKind === 'hit' ? 'Launched or hit · tech the next collision, or spend your escape.'
    : launched && (!current || (local?.moveFrame ?? 0) >= combatMoveDuration(current, local!) - config.inputBufferFrames) ? 'CHASE · Forward + Q / Circle, then H + J / R2 + Square to follow up.'
    : followup ? 'Follow up now · steer your next strike or heavy.'
    : current ? `${current.drive ? 'Drive · ' : ''}${moveName} · ${local!.moveFrame < current.startupFrames ? 'winding up' : local!.moveFrame < current.startupFrames + current.activeFrames ? 'striking' : 'recovering'}`
    : config.maxStamina && (local?.stamina ?? 0) < 10 ? 'Catch your breath · walking, guard and impact tech remain available.'
    : 'Bait a committed attack. Earn your opening.';
  const presentation: GameplayPresentation3D = { title: advanced ? 'Touch of Death' : 'Combat practice', objective: 'A clean launcher can end the fight. Make them miss.',
    hint: advanced ? 'WASD move / aim · Space / Cross jump, hold for height; Q / Circle step, hold sprint, airborne dash; jump in hitstun to tech · J strike · K heavy · hold H Drive · hold L guard / tap parry · I escape · F lock-on · R restart' : 'J strike · K heavy · hold L guard / tap parry · R restart',
    metrics, actions, status: definition.interactions && local?.stunKind === 'block' ? definition.config.guardTurnSpeed ? 'Block stun: turning is slowed. Watch for a cross-up.' : 'Block stun: facing locked. Watch for a cross-up.' : status };
  if (definition.interactions) presentation.hint += ' | G / D-pad down: grapple, pick up, throw; press during grapple to tech. Fresh guard deflects thrown objects.';
  if (definition.movement?.wallRunFrames) presentation.hint += ' | Aim along a wall while airborne to run; press jump at the wall to push off. Wall runs restore the air dash. Both spend stamina.';
  return presentation;
}

export type CombatFramePresentation3D = {
  reducedMotion?: boolean; effects?: boolean; viewportAspect?: number;
  poses?: readonly ResolvedAppearancePose3D[]; styles?: ResolvedAppearance3D['styles'];
  cameraTransform?: (camera: Hyperfocus3DEvaluatedFrame['camera']) => void;
  /** Final host poses and combat cues, after camera framing and before visibility queries. */
  beforeVisibility?: (frame: Hyperfocus3DEvaluatedFrame) => void;
  onPresentationStage?: (stage: string) => void;
  /** Checked (default) revalidates after arbitrary stage observers. Synchronous
   * borrows the already validated binding across camera clearance: the caller
   * promises its observer does not change entity/material identities, ordering,
   * membership or authored material associations during the cameraClearanceMs callback.
   * No binding is borrowed from a previous presentFrame call.
   */
  presentationTopology?: 'checked' | 'synchronous';
  cutawayTopologyWork?: CutawayTopologyWork3D;
  /** Prepared numeric owner, selected outside hot loops; no gameplay authority. */
  targetRayQuery?: import('../../physics/target-rays.ts').PreparedTargetRayQuery3D;
};

/** Bind presentation owners once. Events are read live because simulation replaces their array.
 * Only evaluated records and existing presentation history are mutated; hosts own diagnostic clocks.
 */
export function createCombatFramePresenter(options: {
  definition: CombatProject3D; runtime: Hyperfocus3DRuntime;
  simulation: Pick<ReturnType<typeof createCombatSimulation>, 'capture'>;
  motion: Pick<ReturnType<typeof createCombatMotion3D>, 'capture' | 'surfaces'>;
  defenseFeedback: Pick<ReturnType<typeof createDefenseFeedback3D>, 'capture'>;
  locomotionFx: Pick<ReturnType<typeof createCombatLocomotionEffects3D>, 'events'>;
  interactions?: Pick<ReturnType<typeof createCombatInteractions>, 'capture'>;
  match?: Pick<ReturnType<typeof createCombatMatch3D>, 'capture' | 'presentFrame' | 'phase' | 'postKnockout' | 'terminalRound'>;
  knockout: Pick<ReturnType<typeof createCombatKnockout3D>, 'present'>;
  environment?: Pick<ReturnType<typeof createCombatEnvironment>, 'capture'>;
  presentCombatVisuals3D: ReturnType<typeof createCombatVisualPresenter3D>;
  presentRoundRecovery: ReturnType<typeof createCombatRoundRecovery3D>;
  presentWheels: ReturnType<typeof createTrafficWheelPresenter>;
  events(): readonly CombatEvent[];
  playerId?: string; opponentId?: string;
  cityCamera: boolean; cameraOrbit: CombatCameraOrbit3D;
  cameraBodyIds: readonly string[]; cameraMaterialIds: ReadonlyMap<string, string>;
  movingCameraBodyIds: ReadonlySet<string>; cutawayFade: ReturnType<typeof createCutawayFade>;
}) {
  const { definition, runtime, simulation, motion, defenseFeedback, locomotionFx, interactions, match, knockout,
    environment, presentCombatVisuals3D, presentRoundRecovery, presentWheels, events, playerId, opponentId,
    cityCamera, cameraOrbit, cameraBodyIds, cameraMaterialIds, movingCameraBodyIds, cutawayFade } = options;
  const presentEnvironment = definition.environment ? createCombatEnvironmentPresenter({ definition: definition.environment, entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities }) : undefined;
  const presentInteractions = definition.interactions ? createCombatInteractionPresenter({ definition: definition.interactions, fighterIds: definition.fighters.map(fighter => fighter.entityId), entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities }) : undefined;
  return (frame: Hyperfocus3DEvaluatedFrame, presentation: CombatFramePresentation3D = {}, captured?: CombatPresentationCapture3D, captureWork?: PresentationCaptureWork) => {
    const synchronousTopology = presentation.presentationTopology === 'synchronous';
    if (presentation.presentationTopology !== undefined && presentation.presentationTopology !== 'checked' && !synchronousTopology) throw new Error('Unsupported presentation topology strategy.');
    const state = captured?.state ?? capturePresentationComponent(simulation.capture, 'simulationCaptures', captureWork);
    const interactionState = captured ? captured.interactions : interactions && capturePresentationComponent(interactions.capture, 'interactionCaptures', captureWork);
    presentation.onPresentationStage?.('combatCaptureMs');
    presentCombatVisuals3D({ frame, state, config: definition.config, motion: captured?.motion ?? capturePresentationComponent(motion.capture, 'motionCaptures', captureWork), events: events(), timingFeedback: captured?.defenseFeedback ?? capturePresentationComponent(defenseFeedback.capture, 'feedbackCaptures', captureWork), locomotionEvents: locomotionFx.events, grounded: motion.surfaces().grounded, viewportAspect: presentation.viewportAspect, reducedMotion: presentation.reducedMotion, velocities: new Map(definition.fighters.map(fighter => { const velocity = { x: 0, y: 0, z: 0 };if (!runtime.physics.readVelocity(fighter.entityId, velocity)) throw Error(`Missing fighter body ${fighter.entityId}`);return [fighter.entityId, velocity]; })) });
    presentation.onPresentationStage?.('primitiveVisualsMs');
    presentCombatDash3D({ config: definition.config, frame, state, motion: captured?.motion ?? capturePresentationComponent(motion.capture, 'motionCaptures', captureWork), walls: motion.surfaces().walls });
    presentation.onPresentationStage?.('dashVisualsMs');
    if (interactions) presentInteractions!(frame, interactionState!, state, definition.config);
    presentation.onPresentationStage?.('interactionVisualsMs');
    match?.presentFrame({ frame, state, victoryOverlay: false, viewportAspect: presentation.viewportAspect, poses: presentation.poses, playerId, opponentId });
    presentation.onPresentationStage?.('matchVisualsMs');
    knockout.present(frame);
    presentation.onPresentationStage?.('knockoutVisualsMs');
    if (match && (match.phase === 'round-result' && !match.postKnockout || match.phase === 'match-result')) {
      const result = captured?.match ?? capturePresentationComponent(match.capture, 'matchCaptures', captureWork);
      presentRoundRecovery({ frame, state, allowRecovery: match.phase !== 'match-result' && !match.terminalRound, celebrate: match.phase === 'match-result' || match.terminalRound, ticks: result.ticks, winnerId: result.winner === 'player' ? playerId! : result.winner === 'opponent' ? opponentId! : '', targets: combatRoundStandingTargets({ runtime, state }), poses: presentation.poses, styles: presentation.styles, reducedMotion: presentation.reducedMotion, viewportAspect: presentation.viewportAspect });
    }
    if (interactions && match && (match.phase === 'round-result' || match.phase === 'match-result')) presentInteractions!(frame, interactionState!, state, definition.config, true);
    presentation.onPresentationStage?.('recoveryVisualsMs');
    if (environment) {
      const saved = captured?.environment ?? capturePresentationComponent(environment.capture, 'environmentCaptures', captureWork);
      presentation.onPresentationStage?.('environmentCaptureMs');
      presentEnvironment!(frame, saved);
      presentation.onPresentationStage?.('environmentVisualsMs');
      presentWheels(frame, saved.vehicleStops ?? [], runtime.motionSeed);
      presentation.onPresentationStage?.('vehicleVisualsMs');
      presentCombatHazards({ frame, definition: definition.environment!, entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities, phases: new Map(saved.surfaces.map(surface => [surface.entityId, surface.phase])), state: saved.hazards, effectCapacity: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.effectCapacity ?? 256 });
    }
    presentation.onPresentationStage?.('hazardVisualsMs');
    if (interactions) presentWeaponUtilities({ frame, state: interactionState!, combat: state, definition: definition.interactions, entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities, capacity: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.effectCapacity ?? 256 });
    presentation.onPresentationStage?.('weaponVisualsMs');
    if (cityCamera) {
      if (match?.phase === 'menu') { cameraOrbit.yaw = 0;cameraOrbit.time = frame.timeSeconds; }
      else presentCombatCamera3D({ frame, state, events: events(), viewportAspect: presentation.viewportAspect, reducedMotion: presentation.reducedMotion, orbit: cameraOrbit });
    }
    presentation.cameraTransform?.(frame.camera);
    presentation.onPresentationStage?.('cameraVisualsMs');
    presentation.beforeVisibility?.(frame);
    const bindings = cutawaySceneBindings(frame, cameraMaterialIds, presentation.cutawayTopologyWork);
    clearBoundCombatCameraSurfaces({ frame, world: runtime.physics, bodyIds: cameraBodyIds, materialIds: cameraMaterialIds, movingBodyIds: movingCameraBodyIds }, bindings);
    presentation.onPresentationStage?.('cameraClearanceMs');
    // Clearance changes only the camera. Arbitrary observers still invalidate the borrow.
    presentBoundCombatObstructions3D({ frame, state, viewportAspect: presentation.viewportAspect, materialIds: cameraMaterialIds, weapons: interactionState?.weapons, fade: cutawayFade, targetRayQuery: presentation.targetRayQuery }, presentation.onPresentationStage && !synchronousTopology ? cutawaySceneBindings(frame, cameraMaterialIds, presentation.cutawayTopologyWork) : bindings);
    presentation.onPresentationStage?.('obstructionsMs');
  };
}

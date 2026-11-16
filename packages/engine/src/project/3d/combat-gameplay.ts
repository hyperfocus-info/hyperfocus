import { createCutawayFade } from './combat-visuals/cutaways/cutaway-fade.ts';
import { recoverCombatGapStamina } from './combat-match/stamina.ts';
import { combatMoveDuration } from '../../combat/combo/timing.ts';
import { readCombatAiPolicy, type CombatAiPolicy } from './combat-ai/policy/trained.ts';
import type { CombatAiTuning, CombatAiProfile } from './combat-ai/policy/instrumentation.ts';
import type { CombatAiLearning } from './combat-ai/learning/model.ts';
import { readLearning } from './combat-ai/learning/validation.ts';
import { prepareCombatAiLearning } from './combat-ai/learning/training.ts';
import { bindCombatAiDecisionOverride, type CombatAiDecisionOverride } from './combat-ai/policy/override.ts';
import { pickupStyleProbability } from './combat-ai/policy/style.ts';
import { createBlockedEscape } from './combat-ai/lifecycle/blocked-escape.ts';
import { createObservedHazardRegions } from './combat-environment/hazards/routes.ts';
import { createCombatBreachRoute } from './combat-environment/breach-route.ts';
import { combatRoundSpawn, combatSpawnWorld } from './combat-match/spawns.ts';
import { validateArenaLayoutReferences } from './combat-match/arena-layouts.ts';
import { combatWeaponLayout } from './combat-match/weapon-layouts.ts';
import { combatRoundStandingTargets } from './combat-match/round-recovery.ts';
import { createCombatFallout3D } from './combat-match/fallout.ts';
import { createCombatRoundRecovery3D } from './combat-visuals/round-recovery.ts';
import type { CombatCameraOrbit3D } from './combat-visuals/camera.ts';
import { validateEnvironmentReferences } from './combat-environment/references.ts';
import { createCombatObstacleRoute } from './combat-environment/obstacle-route.ts';
import { createCombatElevationRoute } from './combat-environment/elevation-route.ts';
import { createCombatEnvironment } from './combat-environment/session.ts';
import { createTrafficWheelPresenter } from './combat-environment/vehicles/wheels.ts';
import { createWeaponSurfaceProbe } from './combat-interaction/surfaces.ts';
import { createCombatInteractions } from './combat-interaction/session.ts';
import { createCombatExchange3D } from './combat-practice/exchange.ts';
import { atan2, cos, hypot, sin } from '../../math/simulation.ts';
import { createPracticeSurfaceProbe } from './combat-practice/surface-probe.ts';
import { createCombatSurfaceForecast } from './combat-motion/surface-forecast.ts';
import { createCombatPractice3D } from './combat-practice/session.ts';
import { createCombatSimulation } from '../../combat/simulation.ts';
import { capturePresentationComponent, type PresentationCaptureWork } from './presentation-capture.ts';
import type { Hyperfocus3DRuntime } from '../runtime-3d.ts';
import type { GameplayPresentation3D } from './gameplay-contracts.ts';
import { readCombatProject3D } from './combat-declaration.ts';
import { object } from './gameplay-contracts.ts';
import { createCombatMotion3D, type CombatMotionControl } from './combat-motion.ts';
import { createCombatVisualPresenter3D } from './combat-visuals/actors/primitive-presenter.ts';
import { combatPresentation3D, createCombatFramePresenter } from './combat-presentation.ts';
import { createCombatMatch3D } from './combat-match/index.ts';
import { createCombatAi3D } from './combat-ai.ts';
import { createCombatAiOutcomes } from './combat-ai/outcomes.ts';
import { createCombatHitstop3D } from './combat-hitstop.ts';
import { createCombatInfluence3D } from './combat-influence.ts';
import type { CombatVector } from '../../combat/config.ts';
import type { CombatEvent, CombatInput } from '../../combat/state.ts';
import { sampleInput } from '../../combat/input.ts';
import { createCombatAudio3D } from './combat-audio.ts';
import { createCombatKnockout3D } from './combat-knockout/index.ts';
import { createDefenseFeedback3D } from './combat-visuals/defense-feedback.ts';
import { createCombatLocomotionEffects3D } from './combat-visuals/locomotion-effects.ts';
import { createCombatFighterInputs3D, type CombatFighterInput3D } from './combat-fighter-inputs.ts';

/** Novice Play/build adapter. Advanced hosts can supply bone contacts to the combat core. */
export function createProjectCombat3D(options: { extension: unknown; runtime: Hyperfocus3DRuntime; combatAiPolicies?: readonly [CombatAiPolicy | undefined, CombatAiPolicy | undefined]; combatAiTuning?: readonly [CombatAiTuning | undefined, CombatAiTuning | undefined]; combatAiLearning?: readonly [CombatAiLearning | undefined, CombatAiLearning | undefined]; combatAiProfile?: CombatAiProfile; combatAiDecisionOverride?: CombatAiDecisionOverride; queueSeed?: number; independentInputs?: boolean; externalMatch?: boolean; externalMode?: 'set' | 'training' }) {
  if (options.externalMode !== undefined && !options.externalMatch) throw new Error('External combat mode requires an external match.');
  if (options.externalMatch && !options.independentInputs) throw new Error('External combat matches require independent fighter inputs.');
  const parsed = readCombatProject3D(options.extension);
  if (!parsed?.fighters.length) return undefined;
  const definition = parsed;
  const runtime = options.runtime;
  const initialWorld = runtime.snapshot();
  const presentCombatVisuals3D = createCombatVisualPresenter3D({ entities: initialWorld.entities, fighterIds: definition.fighters.map(fighter => fighter.entityId) });
  const fighterWorldOrder = initialWorld.entities.filter(entity => definition.fighters.some(fighter => fighter.entityId === entity.id)).map(entity => entity.id);
  const cameraOrbit: CombatCameraOrbit3D = { yaw: 0 };
  const cutawayFade = createCutawayFade();
  const cityCamera = initialWorld.entities.some(entity => entity.id === 'tod:city:street');
  const presentWheels = createTrafficWheelPresenter({ entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities });
  const cameraBodyIds = initialWorld.entities.filter(entity => runtime.physics.body(entity.id)?.type === 'static').map(entity => entity.id);
  const cameraMaterialIds = new Map(runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities.map(entity => [entity.id, entity.materialId]));
  const movingCameraBodyIds = new Set(runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities.filter(entity => entity.animation).map(entity => entity.id));
  for (const prop of [...(definition.spawns ?? []).flatMap(spawn => spawn.props ?? []), ...(definition.weaponLayouts ?? []).flatMap(district => district.variants.flatMap(variant => variant.props))]) {
    const entity = runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities.find(entity => entity.id === prop.entityId);
    if (!entity || entity.animation) throw new Error(`Starting location prop ${prop.entityId} must be an existing non-animated object.`);
  }
  validateArenaLayoutReferences({ definition, declaration: runtime.declaration });
  // The title and the first match share the queued district, props and motion seed.
  // Loading layout zero here exposed a different arena until Start reset the world.
  const startsAtMatchSpawn = !!(definition.match || options.externalMatch) && options.externalMode !== 'training';
  const startingIndex = startsAtMatchSpawn ? options.queueSeed ?? 0 : 0;
  const startingWorld = combatSpawnWorld({ definition, world: initialWorld, index: startingIndex, declaration: runtime.declaration, layoutOnly: !startsAtMatchSpawn });
  if (startingWorld !== initialWorld) runtime.restore(startingWorld);
  const initialPhysics = runtime.physics.checkpoint();
  const gravity = new Map(runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities.map(entity => [entity.id, -9.81 * (entity.physics?.gravityScale ?? 1)]));
  const fighters = definition.fighters.map(fighter => {
    const entity = startingWorld.entities.find(item => item.id === fighter.entityId);
    if (!entity || runtime.physics.body(fighter.entityId)?.type !== 'dynamic') throw new Error(`Combat fighter ${fighter.entityId} needs a dynamic body in the active scene.`);
    const target = startingWorld.entities.find(item => item.id !== entity.id && definition.fighters.some(fighter => fighter.entityId === item.id));
    const dx = (target?.position[0] ?? entity.position[0] + 1) - entity.position[0], dz = (target?.position[2] ?? entity.position[2]) - entity.position[2];
    return { id: entity.id, position: { x: entity.position[0], y: entity.position[1], z: entity.position[2] }, facing: { x: dx || (dz ? 0 : 1), y: 0, z: dz } };
  });
  const simulation = createCombatSimulation({ config: definition.config, fighters });
  const fallout = createCombatFallout3D({ runtime, fighterIds: fighters.map(fighter => fighter.id), spawnPositions: definition.spawns?.flatMap(spawn => spawn.positions) });
  const initialCombat = simulation.capture();
  const interactions = definition.interactions ? createCombatInteractions({ activeWeaponIds: combatWeaponLayout(definition, startingIndex)?.active, surface: createWeaponSurfaceProbe(runtime.physics, initialWorld.entities.filter(entity => !fighters.some(fighter => fighter.id === entity.id) && !definition.interactions!.weapons.some(item => item.entityId === entity.id)).map(entity => entity.id)), definition: definition.interactions, config: definition.config, fighterIds: fighters.map(fighter => fighter.id), positions: new Map(startingWorld.entities.map(entity => [entity.id, { x: entity.position[0], y: entity.position[1], z: entity.position[2] }])) }) : undefined;
  if (definition.environment) validateEnvironmentReferences({ definition: definition.environment, declaration: runtime.declaration, fighterIds: fighters.map(fighter => fighter.id), config: definition.config });
  const environment = definition.environment ? createCombatEnvironment({ definition: definition.environment, world: runtime.physics, entityIds: initialWorld.entities.map(entity => entity.id), entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities }) : undefined;
  const exchange = createCombatExchange3D();
  const knockout = createCombatKnockout3D({ runtime, fighterIds: fighters.map(fighter => fighter.id) });
  const motion = createCombatMotion3D({ runtime, definition });
  const match = definition.match || options.externalMatch ? createCombatMatch3D({ ...definition.match, queueSeed: options.queueSeed, online: options.externalMatch, mode: options.externalMode }) : undefined;
  const practice = createCombatPractice3D({ config: definition.config, nearSurface: createPracticeSurfaceProbe({ world: runtime.physics, bodyIds: initialWorld.entities.map(entity => entity.id) }) });
  const navigate = definition.movement ? createCombatElevationRoute({ world: runtime.physics, bodyIds: initialWorld.entities.map(entity => entity.id), movement: definition.movement, gravityY: id => gravity.get(id) ?? -9.81 }) : undefined;
  const indirectMoveIds = (definition.interactions?.weapons.flatMap(weapon => [weapon.lightMoveId, weapon.heavyMoveId]) ?? []).filter(id =>
    definition.config.moves.find(move => move.id === id)?.command.some(key => !['jab', 'heavy', 'evade', 'escape', 'followup', 'feint'].includes(key)));
  const outcomes = createCombatAiOutcomes();
  const ai = match ? createCombatAi3D({ learning: options.combatAiLearning?.[1], tuning: options.combatAiTuning?.[1], profile: options.combatAiProfile, decisionOverride: bindCombatAiDecisionOverride(options.combatAiDecisionOverride, 1), trainedPolicy: options.combatAiPolicies?.[1], config: definition.config, navigate, indirectMoveIds, outcomes }) : undefined;
  const playerAi = match && !options.externalMatch ? createCombatAi3D({ learning: options.combatAiLearning?.[0], tuning: options.combatAiTuning?.[0], profile: options.combatAiProfile, decisionOverride: bindCombatAiDecisionOverride(options.combatAiDecisionOverride, 0), trainedPolicy: options.combatAiPolicies?.[0], config: definition.config, navigate, indirectMoveIds, outcomes }) : undefined;
  let reportContextKey = '';
  function updateReportContext() {
    if (!match || !player || !opponent || !ai) return;
    const score = match.capture(), mode = options.externalMatch ? 'online' : score.phase === 'practice' ? 'practice' : match.theater ? 'theater' : 'human-vs-ai';
    const round = Math.max(1, score.playerWins + score.opponentWins + (score.phase === 'round-result' || score.phase === 'match-result' ? 0 : 1));
    const key = `${mode}:${score.matchIndex ?? 0}:${round}:${match.difficulty}:${score.phase}:${ai.hasProfile}:${playerAi?.hasProfile}:${ai.policyId}:${playerAi?.policyId}`;
    if (key === reportContextKey) return;
    reportContextKey = key;
    outcomes.context({ mode, match: score.matchIndex ?? 0, round, fighters: [
      { id: player.entityId, type: match.theater ? 'ai' : 'human', ...(match.theater ? { level: 9, policyId: playerAi?.policyId, traits: playerAi?.capture().personality?.preferences } : {}) },
      { id: opponent.entityId, type: options.externalMatch ? 'human' : 'ai', ...(!options.externalMatch ? { level: match.difficulty, policyId: ai.policyId, traits: ai.capture().personality?.preferences } : {}) },
    ] });
  }
  const initialPlayerAi = playerAi?.capture();
  if (initialPlayerAi) delete initialPlayerAi.trainedPolicy;
  const surfaceForecast = createCombatSurfaceForecast({ world: runtime.physics, bodyIds: initialWorld.entities.map(entity => entity.id) });
  const observedHazards = definition.environment && environment ? createObservedHazardRegions({ world: runtime.physics, entities: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities, definition: definition.environment, active: environment.removed }) : undefined;
  const hazardRoute = observedHazards ? createCombatObstacleRoute({ world: runtime.physics, bodyIds: initialWorld.entities.map(entity => entity.id), hazards: observedHazards }) : undefined;
  const blockedEscape = createBlockedEscape({ world: runtime.physics, bodyIds: initialWorld.entities.map(entity => entity.id) });
  const obstacleRoute = createCombatObstacleRoute({ world: runtime.physics, bodyIds: initialWorld.entities.map(entity => entity.id) });
  const breachRoute = definition.environment && definition.movement ? createCombatBreachRoute({ world: runtime.physics, bodyIds: initialWorld.entities.map(entity => entity.id), environment: definition.environment, config: definition.config, indirectMoveIds, speed: definition.movement.speed }) : undefined;
  const audio = createCombatAudio3D({ definition, runtime, hazards: environment?.hazardAudio, inactiveEnvironment: environment?.audioInactive });
  const player = options.externalMatch ? definition.fighters[0] : definition.fighters.find(fighter => fighter.control === 'player');
  const opponent = definition.fighters.find(fighter => fighter.entityId !== player?.entityId);
  let held = new Set<string>();
  const hitstop = createCombatHitstop3D({ scale: definition.config.hitstopScale });
  const influence = createCombatInfluence3D({ world: runtime.physics, config: definition.config, fighterIds: fighters.map(fighter => fighter.id) });
  let fighterInputs = options.independentInputs ? createCombatFighterInputs3D(definition) : undefined;
  const locomotionFx = createCombatLocomotionEffects3D();
  const defenseFeedback = createDefenseFeedback3D({ fighterIds: fighters.map(fighter => fighter.id), config: definition.config });
  let visualEvents: CombatEvent[] = [];
  const presentRoundRecovery = createCombatRoundRecovery3D();
  const presentFrame = createCombatFramePresenter({
    definition, runtime, simulation, motion, defenseFeedback, locomotionFx, interactions, match, knockout, environment,
    presentCombatVisuals3D, presentRoundRecovery, presentWheels, events: () => visualEvents,
    playerId: player?.entityId, opponentId: opponent?.entityId,
    cityCamera, cameraOrbit, cameraBodyIds, cameraMaterialIds, movingCameraBodyIds, cutawayFade,
  });
  function recoverRound() {
    const current = simulation.capture(), targets = combatRoundStandingTargets({ runtime, state: current });
    for (const actor of current.fighters) if (actor.health <= 0 && fallout.outside(runtime.physics.body(actor.id)!)) targets.set(actor.id, { ...initialCombat.fighters.find(fighter => fighter.id === actor.id)!.position });
    const recovered = structuredClone(initialCombat);recovered.frame = current.frame;
    for (const actor of recovered.fighters) {
      const previous = current.fighters.find(fighter => fighter.id === actor.id)!;
      const body = runtime.physics.body(actor.id)!, position = targets.get(actor.id) ?? { x: body.x, y: body.y, z: body.z };
      actor.position = { ...position };actor.facing = { ...previous.facing };
      const other = current.fighters.find(fighter => fighter.id !== actor.id);
      if (other) {
        const live = runtime.physics.body(other.id)!, destination = targets.get(other.id) ?? { x: live.x, y: live.y, z: live.z };
        const dx = destination.x - position.x, dz = destination.z - position.z, distance = hypot(dx, dz);
        if (distance > .00001) actor.facing = { x: dx / distance, y: 0, z: dz / distance };
      }
      runtime.applyCommands({ commands: [{ type: 'teleport', entityId: actor.id, position: [position.x, position.y, position.z], rotationY: atan2(actor.facing.x, actor.facing.z) }] });
      runtime.physics.setVelocity(actor.id, 0, 0, 0);
    }
    knockout.reset();simulation.restore({ snapshot: recovered });
    if (interactions) interactions.restore({ ...interactions.capture(), grapples: [], attempts: [], lastAttacks: {} });
    exchange.reset();practice.resetRound();locomotionFx.reset();defenseFeedback.reset();held.clear();hitstop.reset();influence.reset();fighterInputs?.reset();visualEvents = [];motion.reset();ai?.reset({ round: true });playerAi?.reset({ round: true });
  }
  function stepRoundInterlude(actions: ReadonlySet<string>) {
    hitstop.reset();influence.reset();const before = simulation.capture(), current = structuredClone(before);current.frame++;
    for (const fighter of current.fighters) {
      const body = runtime.physics.body(fighter.id)!;
      fighter.position = { x: body.x, y: body.y, z: body.z };fighter.guarding = false;
      const move = definition.config.moves.find(move => move.id === fighter.moveId);
      if (move && ++fighter.moveFrame >= combatMoveDuration(move, fighter)) { fighter.moveId = '';fighter.moveFrame = 0; }
      if (fighter.health > 0) runtime.physics.setVelocity(fighter.id, 0, body.velocityY, 0);
    }
    recoverCombatGapStamina(current, definition.config, motion.surfaces().grounded);
    if (runtime.diagnosticFeatures.environmentMotion) environment?.step(current);
    const protectedState = structuredClone(current);
    for (const fighter of protectedState.fighters) fighter.protectionFrames = 1;
    interactions?.after(protectedState, [], []);
    if (definition.audio) audio.step({ before, after: current, events: [], interactions: environment?.transitions.map(event => ({ kind: event.kind === 'warning' ? event.cause === 'impact' ? 'environment-strike' : 'environment-warning' : 'environment-removed', actor: event.entityId })) ?? [], grounded: motion.surfaces().grounded, motion: motion.capture() });
    simulation.restore({ snapshot: current });if (runtime.diagnosticFeatures.koPhysics) knockout.step(current, []);held = new Set(actions);
    return new Set(fighters.map(fighter => fighter.id));
  }
  function resetRound() { cutawayFade.reset();cameraOrbit.yaw = 0;cameraOrbit.time = undefined;environment?.reset();exchange.reset();practice.resetRound();locomotionFx.reset();defenseFeedback.reset();knockout.reset();const score = match?.capture();const spawn = combatRoundSpawn({ definition, world: initialWorld, state: initialCombat, completedMatches: score && score.phase !== 'practice' ? score.matchIndex ?? 0 : 0, declaration: runtime.declaration });runtime.physics.restoreCheckpoint(initialPhysics);runtime.restore(spawn.world);interactions?.reset(new Map(spawn.world.entities.map(entity => [entity.id, { x: entity.position[0], y: entity.position[1], z: entity.position[2] }])), combatWeaponLayout(definition, score && score.phase !== 'practice' ? score.matchIndex ?? 0 : 0)?.active);simulation.restore({ snapshot: spawn.state });held.clear();hitstop.reset();influence.reset();fighterInputs?.reset();visualEvents = [];motion.reset();ai?.reset();playerAi?.reset();audio.reset(false); }
  function resetState() { cutawayFade.reset();cameraOrbit.yaw = 0;cameraOrbit.time = undefined;environment?.reset();interactions?.reset();exchange.reset();locomotionFx.reset();defenseFeedback.reset();knockout.reset();simulation.restore({ snapshot: initialCombat });held.clear();hitstop.reset();influence.reset();fighterInputs?.reset();visualEvents = [];motion.reset();ai?.reset();playerAi?.reset();match?.reset();practice.reset();audio.reset(); }
  function reset() { match?.reset();resetRound();practice.reset();audio.reset(); }
  function validate(value: unknown) {
    const record = object(value);
    if (!Array.isArray(record.held) || record.held.length > 256 || !record.held.every((item: unknown) => typeof item === 'string' && item.length <= 256)) throw new Error('Invalid saved combat inputs.');
    const inputs = record.held.filter((item: unknown): item is string => typeof item === 'string');
    const probe = createCombatSimulation({ config: definition.config, fighters });probe.restore({ snapshot: record.state });
    if (match) match.validate(record.match);
    const aiState = ai ? ai.validate(record.ai) : undefined;
    const playerAiState = playerAi?.validate(record.playerAi ?? (initialPlayerAi ? { ...initialPlayerAi, tuning: undefined, learning: undefined, plan: undefined } : undefined));
    if (playerAiState?.queue.some(action => action.input.fighterId !== player?.entityId || action.input.pressed?.some(key => key !== 'interact' && !definition.config.moves.some(move => move.command.includes(key))))) throw Error('Invalid theater AI inputs.');
    if (aiState?.queue.some(action => action.input.fighterId !== opponent?.entityId || action.input.pressed?.some(key => key !== 'interact' && !definition.config.moves.some(move => move.command.includes(key))))) throw new Error('Saved AI inputs must belong to the match opponent and known commands.');
    const rigs = knockout.validate(record.knockout);
    if (!options.independentInputs && record.fighterInputs !== undefined && object(record.match).phase !== 'practice') throw new Error('Local independent inputs are available only in practice.');
    const savedInputs = options.independentInputs || record.fighterInputs !== undefined ? createCombatFighterInputs3D(definition).validate(record.fighterInputs) : undefined;
    if (rigs.some(rig => probe.capture().fighters.find(fighter => fighter.id === rig.id)?.health !== 0)) throw new Error('Only defeated fighters may have saved knockout bodies.');
    return { environment: environment?.validate(record.environment), interactions: interactions ? interactions.validate(record.interactions) : undefined, exchange: exchange.validate(record.exchange), fighterInputs: savedInputs, practice: practice.validate(record.practice), state: probe.capture(), defenseFeedback: defenseFeedback.validate(record.defenseFeedback), knockout: rigs, held: inputs, hitstop: hitstop.validate(record.hitstop), influence: influence.validate(record.influence), motion: record.motion === undefined ? undefined : motion.validate(record.motion), match: record.match, ai: aiState, playerAi: playerAiState };
  }
  function capture(work?: PresentationCaptureWork) {
    if (work) work.compositeCaptures++;
    return {
      ...(environment ? { environment: capturePresentationComponent(environment.capture, 'environmentCaptures', work) } : {}),
      ...(interactions ? { interactions: capturePresentationComponent(interactions.capture, 'interactionCaptures', work) } : {}),
      exchange: exchange.capture(), ...(fighterInputs ? { fighterInputs: fighterInputs.capture() } : {}), practice: practice.capture(),
      state: capturePresentationComponent(simulation.capture, 'simulationCaptures', work),
      defenseFeedback: capturePresentationComponent(defenseFeedback.capture, 'feedbackCaptures', work),
      knockout: knockout.capture(), held: [...held], hitstop: hitstop.capture(), influence: influence.capture(),
      motion: capturePresentationComponent(motion.capture, 'motionCaptures', work),
      ...(match && ai ? { match: capturePresentationComponent(match.capture, 'matchCaptures', work), ai: ai.capture({ compactLearning: true }),
        ...(playerAi && (match.theater || playerAi.policyId || playerAi.hasQueuedPolicy || playerAi.hasLearningConfiguration) ? { playerAi: playerAi.capture({ compactLearning: true }) } : {}) } : {}),
    };
  }
  return {
    /** Trusted local rollback. Restore host runtime/physics after this checkpoint. */
    checkpoint() {
      const savedInputs = fighterInputs, pause = hitstop.checkpoint(), controls = fighterInputs?.checkpoint(), corpse = knockout.checkpoint();
      const state = structuredClone({ environment: environment?.capture(), interactions: interactions?.capture(), exchange: exchange.capture(), combat: simulation.capture(), practice: practice.capture(), feedback: defenseFeedback.capture(),
        influence: influence.capture(), held: [...held], motion: motion.capture(), match: match?.capture(), ai: ai?.capture(), playerAi: playerAi?.capture() });
      const presentation = structuredClone({ events: visualEvents, locomotion: locomotionFx.capture(), audio: audio.capture() });
      return { state: { ...state, pause: pause.state, controls: controls?.state, knockout: corpse.state }, restore() {
        const saved = structuredClone(state);
        if (saved.environment) environment?.restore(saved.environment);if (saved.interactions) interactions?.restore(saved.interactions);exchange.restore(saved.exchange);simulation.restore({ snapshot: saved.combat });practice.restore(saved.practice);defenseFeedback.restore(saved.feedback);
        held = new Set(saved.held);influence.restore(saved.influence);motion.restore(saved.motion);
        if (match && saved.match) match.restore(saved.match);if (ai && saved.ai) ai.restore(saved.ai);if (playerAi && saved.playerAi) playerAi.restore(saved.playerAi);
        fighterInputs = savedInputs;pause.restore();controls?.restore();corpse.restore();
        visualEvents = structuredClone(presentation.events);locomotionFx.restore(presentation.locomotion);audio.restore(presentation.audio);
      } };
    },
    get handlesStart() { return match?.handlesStart ?? false; },
    platformPositions(tick: number, seed: number) { return environment?.platformPositions(tick, seed); },
    get frozen() { return hitstop.frozen || (match?.handlesStart ?? false); },
    state() { return simulation.capture(); },
    capture,
    validate,
    validateInputs(inputs?: readonly CombatFighterInput3D[]) {
      if (options.independentInputs) { fighterInputs!.read(inputs);return; }
      if (!inputs) { fighterInputs = undefined;return; }
      if (match?.phase !== 'practice') throw new Error('Local independent inputs are available only in practice.');
      const channels = fighterInputs ?? createCombatFighterInputs3D(definition);
      channels.read(inputs);fighterInputs = channels;
    },
    restore(value: unknown) { const saved = validate(value);cutawayFade.reset();cameraOrbit.yaw = 0;cameraOrbit.time = undefined;if (saved.environment) environment?.restore(saved.environment);if (saved.interactions) interactions?.restore(saved.interactions);exchange.restore(saved.exchange);simulation.restore({ snapshot: saved.state });practice.restore(saved.practice);locomotionFx.reset();defenseFeedback.restore(saved.defenseFeedback);knockout.restore(saved.knockout);held = new Set(saved.held);hitstop.restore(saved.hitstop);influence.restore(saved.influence);fighterInputs = saved.fighterInputs ? createCombatFighterInputs3D(definition) : undefined;if (saved.fighterInputs) fighterInputs!.restore(saved.fighterInputs);visualEvents = [];if (saved.motion) motion.restore(saved.motion);else motion.reset();if (match) match.restore(saved.match);if (ai) ai.restore(saved.ai);if (playerAi && saved.playerAi) playerAi.restore(saved.playerAi);audio.reset(); },
    presentFrame,
    physicsDiagnostics: knockout.diagnostics,
    reset,
    resetState,
    drainAudio: audio.drain,
    setAudioListener(options: { fighterId?: string }) {
      if (options.fighterId !== undefined && !definition.fighters.some(fighter => fighter.entityId === options.fighterId)) throw Error('Audio listener must be a fighter in this combat.');
      audio.setListener(options.fighterId);
    },
    queueCombatAiPolicies(options: { policies: readonly [CombatAiPolicy | undefined, CombatAiPolicy | undefined] }) {
      const policies = options.policies.map(readCombatAiPolicy);
      playerAi?.queuePolicy({ policy: policies[0] });ai?.queuePolicy({ policy: policies[1] });
    },
    aiReport() { updateReportContext();return ai?.outcomes.report(); },
    aiLearning() { return [playerAi?.learning(), ai?.learning()] as const; },
    startAiLearningEvidence() { playerAi?.startLearningEvidence();ai?.startLearningEvidence(); },
    aiLearningEvidence() { return [playerAi?.learningEvidence(), ai?.learningEvidence()] as const; },
    finishAiLearningEvidence() {
      const first = playerAi?.finishLearningEvidence(), second = ai?.finishLearningEvidence();
      return { learning: [first?.learning, second?.learning] as const, evidence: [first?.evidence, second?.evidence] as const };
    },
    queueCombatAiLearning(options: { models: readonly [CombatAiLearning | undefined, CombatAiLearning | undefined] }) {
      const models = options.models.map(readLearning);
      playerAi?.queueLearning({ model: prepareCombatAiLearning({ model: models[0], opponentId: playerAi.capture().tuning?.opponentId ?? opponent?.entityId, retainPartial: false }) });
      ai?.queueLearning({ model: prepareCombatAiLearning({ model: models[1], opponentId: ai.capture().tuning?.opponentId ?? player?.entityId, retainPartial: false }) });
    },
    matchState() { return match?.capture(); },
    step(actions: ReadonlySet<string>, independent?: readonly CombatFighterInput3D[], localDirection?: CombatVector) {
      if (localDirection && (localDirection.y !== 0 || !Number.isFinite(localDirection.x) || !Number.isFinite(localDirection.z) || hypot(localDirection.x, localDirection.z) > 1.000001)) throw Error('Local combat direction must be a bounded planar vector');
      if (match?.theater) { actions = new Set([...actions].filter(action => !definition.fighters.some(fighter => action.startsWith(fighter.actionPrefix))));localDirection = undefined; }
      const samples = fighterInputs?.read(independent);
      const liveDirections = new Map(definition.fighters.flatMap((fighter, index) => samples?.[index] ? [[fighter.entityId, samples[index]!.direction] as const] : fighter.control === 'player' && !match?.theater ? [[fighter.entityId, localDirection ?? motion.direction(actions)] as const] : []));
      // A lethal impact keeps its full contact freeze before the post-KO clock starts.
      if (!actions.has('match:quit') && hitstop.pending && (!match || match.phase === 'fighting' || match.postKnockout)) {
        influence.step(liveDirections, true);
        if (samples) fighterInputs!.begin(samples);
        if (hitstop.begin(actions, localDirection)) return new Set(fighters.map(fighter => fighter.id));
      }
      if (match && player && opponent) {
        if (!options.externalMatch && match.phase === 'practice' && actions.has(`${player.actionPrefix}reset`)) actions = new Set([...actions, 'practice:reset']);
        if (!options.externalMatch && match.phase === 'practice' && (practice.select(actions) || !fighterInputs && practice.repeat(simulation.capture()))) resetRound();
        const freshPractice = !options.externalMatch && match.phase !== 'practice' && actions.has('match:practice');
        const phase = match.step({ actions, state: simulation.capture(), playerId: player.entityId, opponentId: opponent.entityId });
        // A new free-practice session starts neutral; in-session reset retains its preset.
        if (freshPractice && phase.resetRound && match.capture().phase === 'practice') practice.reset();
        if (phase.resetRound && match.phase === 'intro' && !options.externalMatch) ai?.outcomes.resumeLive();
        if (phase.resetRound) { const lesson = actions.has('match:learn-defense') ? exchange.defensePractice(player.entityId) : undefined;resetRound();if (lesson) practice.select(new Set([`practice:${lesson}`])); }
        if (phase.recoverRound) { recoverRound();held = new Set(actions);if (samples) fighterInputs!.hold(samples); }
        audio.phase(match.capture());
        if (match.phase === 'round-result' && !match.postKnockout) { if (samples) fighterInputs!.hold(samples);return stepRoundInterlude(actions); }
        if (!phase.fighting) {
          if (match.phase === 'countdown' || match.phase === 'match-result') { const state = simulation.capture();recoverCombatGapStamina(state, definition.config, motion.surfaces().grounded);simulation.restore({ snapshot: state }); }
          held = new Set(actions);if (samples) fighterInputs!.hold(samples);return new Set(fighters.map(fighter => fighter.id));
        }
      } else if (definition.fighters.some(fighter => actions.has(`${fighter.actionPrefix}reset`) && !held.has(`${fighter.actionPrefix}reset`))) { resetRound();held = new Set(actions);return new Set<string>(); }
      if (!match) audio.phase();
      if (samples) fighterInputs!.begin(samples);
      if (hitstop.begin(actions, localDirection)) { influence.step(liveDirections, true);return new Set(fighters.map(fighter => fighter.id)); }
      actions = hitstop.resume(actions, localDirection);
      const world = { tick: runtime.tick, motionSeed: runtime.motionSeed, entities: fighterWorldOrder.map(id => runtime.entityState(id)) }, before = simulation.capture(), tick = before.frame;
      if (runtime.diagnosticFeatures.environmentMotion) environment?.step(before);
      const surfaces = motion.surfaces();
      const controls = samples ? fighterInputs!.resume(samples) : new Map<string, CombatMotionControl>();
      if (!samples && player && localDirection) controls.set(player.entityId, { actions, previous: held, direction: hitstop.direction ?? localDirection, releaseDirection: hitstop.releaseDirection });
      const inputs: CombatInput[] = definition.fighters.map(fighter => {
        const control = controls.get(fighter.entityId), active = control?.actions ?? actions, previous = control?.previous ?? held;
        const controlled = !!control || fighter.control === 'player';
        return ({
        fighterId: fighter.entityId,
        pressed: !control && fighter.control === 'sparring' ? tick % 90 === 0 ? ['jab'] : [] : !control && fighter.control === 'dummy' ? [] : [...active].filter(action => action.startsWith(fighter.actionPrefix) && !previous.has(action)).map(action => action.slice(fighter.actionPrefix.length)).filter(key => key === 'interact' || definition.config.moves.some(move => move.command.includes(key))),
        guard: controlled && active.has(`${fighter.actionPrefix}guard`),
        guardFresh: controlled && active.has(`${fighter.actionPrefix}guard`) && !previous.has(`${fighter.actionPrefix}guard`),
        tech: controlled && (active.has(`${fighter.actionPrefix}tech`) || ['jump', 'dash'].some(key => active.has(fighter.actionPrefix + key) && !previous.has(fighter.actionPrefix + key))),
        drive: controlled && active.has(`${fighter.actionPrefix}drive`),
        held: controlled ? [...active].filter(action => action.startsWith(fighter.actionPrefix)).map(action => action.slice(fighter.actionPrefix.length)) : [],
        airborne: !surfaces.grounded.has(fighter.entityId),
        dashStart: motion.startingDash(fighter.entityId, active, previous, surfaces.grounded, control), idle: motion.idle(fighter.entityId), dashing: motion.attackEligible(fighter.entityId),
        locomotionCost: motion.cost(fighter.entityId, active, previous, surfaces.grounded, control),
        direction: control?.direction ?? (fighter.control === 'player' ? motion.direction(actions) : undefined),
      }); });
      const nextHeld = new Set(actions);
      if (runtime.diagnosticFeatures.ai && !fighterInputs && ai && match && player && opponent) {
        const seats = [{ brain: ai, self: opponent, target: player }, ...(match.theater && playerAi ? [{ brain: playerAi, self: player, target: opponent }] : [])];
        for (const { brain: ai, self: opponent, target: player } of seats) {
        const decision = match.phase === 'practice' ? practice.decide({ state: before, fighterId: opponent.entityId, targetId: player.entityId, body: runtime.physics.body(opponent.entityId)!, collision: surfaces.collisions.some(collision => collision.fighterId === opponent.entityId) }) : ai.step({ seed: ((world.motionSeed ?? 0) + (match.capture().matchIndex ?? 0) * 7919) >>> 0, state: before, fighterId: opponent.entityId, targetId: player.entityId, difficulty: match.difficulty, blockedEscape: match.difficulty >= 7 && ai.preferences().reroute > .4 && surfaces.grounded.has(opponent.entityId) && surfaces.collisions.some(collision => collision.fighterId === opponent.entityId) && before.frame % 90 < 18 ? blockedEscape(opponent.entityId, player.entityId, ai.preferences().positioning > 1 ? 1 : -1) : undefined, dashing: motion.attackEligible(opponent.entityId), weapons: interactions?.observedWeapons(), grapple: interactions?.techWindow(opponent.entityId), grab: definition.interactions ? { range: (definition.interactions.grappleRange ?? 1.8) + definition.config.hurtRadius, startupFrames: definition.interactions.grappleStartupFrames ?? 0 } : undefined,
          breach: match.difficulty >= 7 && surfaces.grounded.has(opponent.entityId) && !before.fighters.find(fighter => fighter.id === opponent.entityId)!.moveId ? breachRoute?.(opponent.entityId, player.entityId, before.fighters.find(fighter => fighter.id === opponent.entityId)!.stamina, (9 - match.difficulty) * 3) : undefined,
          route: surfaces.grounded.has(opponent.entityId) ? (match.difficulty >= 7 && hazardRoute ? hazardRoute : obstacleRoute)(opponent.entityId, player.entityId) : undefined, grounded: surfaces.grounded.has(opponent.entityId), targetGrounded: surfaces.grounded.has(player.entityId),
          gravityY: gravity.get(opponent.entityId), targetGravityY: gravity.get(player.entityId),
          surfaceContactFrames: before.fighters.find(fighter => fighter.id === opponent.entityId)?.stunKind === 'hit'
            ? surfaceForecast(opponent.entityId, gravity.get(opponent.entityId) ?? -9.81, 12) : Infinity,
          wall: surfaces.walls.get(opponent.entityId) && (definition.movement?.wallJumpSpeed || definition.movement?.wallRunFrames) ? { normal: surfaces.walls.get(opponent.entityId)!, jumpCost: definition.movement.wallJumpCost ?? definition.movement.jumpCost ?? 0, runCost: definition.movement.wallRunCost ?? definition.movement.sprintCost ?? .35 } : undefined, collision: surfaces.collisions.some(collision => collision.fighterId === opponent.entityId), body: runtime.physics.body(opponent.entityId)!, targetBody: runtime.physics.body(player.entityId)! });
        const pickupOpportunity = (before.frame / 90 | 0) * 37 % 101 / 100;
        const items = ai.preferences().items;
        const allowPickup = pickupOpportunity < (ai.adaptive ? pickupStyleProbability(items) : .15 + .7 * (items - .3) / 1.4) && !decision.input.guard && !decision.input.pressed?.length;
        const pickupDirection = match.phase !== 'practice' && allowPickup ? interactions?.aiPickupDirection(before, opponent.entityId, player.entityId) : undefined;
        if (pickupDirection) { decision.direction = pickupDirection;decision.input.direction = pickupDirection;decision.jump = false;decision.dash = false;decision.sprint = false; }
        const aiActions = new Set<string>();
        if (decision.input.guard) aiActions.add(opponent.actionPrefix + 'guard');
        if (decision.input.drive) aiActions.add(opponent.actionPrefix + 'drive');
        if (decision.jump || definition.movement?.separateJump && motion.holdingJump(opponent.entityId)) aiActions.add(opponent.actionPrefix + 'jump');
        if (decision.sprint) aiActions.add(opponent.actionPrefix + (definition.movement?.separateJump ? 'dash' : 'jump'));
        if (decision.dash) aiActions.add(opponent.actionPrefix + 'dash');
        const control = { actions: aiActions, previous: held, direction: decision.jump && !definition.movement?.separateJump ? { x: 0, y: 0, z: 0 } : decision.direction };
        controls.set(opponent.entityId, control);if (match.theater) liveDirections.set(opponent.entityId, decision.input.direction ?? decision.direction);
        for (const action of aiActions) nextHeld.add(action);
        const input = { ...decision.input, guardFresh: !!decision.input.guard && !held.has(opponent.actionPrefix + 'guard'), direction: decision.input.direction ?? decision.direction, airborne: !surfaces.grounded.has(opponent.entityId), dashStart: motion.startingDash(opponent.entityId, aiActions, held, surfaces.grounded, control), idle: motion.idle(opponent.entityId), dashing: motion.attackEligible(opponent.entityId), locomotionCost: motion.cost(opponent.entityId, aiActions, held, surfaces.grounded, control) };
        // Practice's passive defender must not secretly pick tools or auto-tech
        // every grab. Only its explicit tech preset supplies grapple responses.
        const practiceInteraction = match.phase === 'practice';
        if (!input.guard && !input.pressed?.length && (!practiceInteraction || practice.capture().preset === 'tech') && interactions?.aiPress(before, opponent.entityId, player.entityId, practiceInteraction, input.direction, allowPickup)) input.pressed = ['interact'];
        if (practiceInteraction && practice.capture().preset === 'tech' && interactions?.techWindow(opponent.entityId)) input.pressed = ['interact'];
        input.pressed = input.pressed?.filter(key => key !== 'drive' || input.drive && !held.has(opponent.actionPrefix + 'drive'));
        inputs[inputs.findIndex(input => input.fighterId === opponent.entityId)] = input;
        }
      }
      updateReportContext();
      for (const input of inputs) { if (liveDirections.has(input.fighterId)) input.influenceDirection = liveDirections.get(input.fighterId);else if (input.direction) liveDirections.set(input.fighterId, input.direction); }
      influence.step(liveDirections, false, surfaces.collisions);
      const poses = definition.fighters.map(fighter => {
        const entity = world.entities.find(item => item.id === fighter.entityId)!;
        const target = world.entities.filter(item => item.id !== entity.id && definition.fighters.some(f => f.entityId === item.id)).sort((a, b) => hypot(...a.position.map((v, i) => v - entity.position[i]!)) - hypot(...b.position.map((v, i) => v - entity.position[i]!)))[0];
        const dx = (target?.position[0] ?? entity.position[0] + 1) - entity.position[0], dz = (target?.position[2] ?? entity.position[2]) - entity.position[2];
        const previous = before.fighters.find(f => f.id === entity.id)!;
        const move = definition.config.moves.find(item => item.id === previous.moveId && previous.moveFrame < combatMoveDuration(item, previous));
        const input = inputs.find(input => input.fighterId === fighter.entityId);
        const direction = input?.direction ?? { x: 0, y: 0, z: 0 };
        const sampled = sampleInput(previous, input, definition.config.directionMode);
        const linking = !previous.stunFrames && move?.cancels.some(link => {
          const next = definition.config.moves.find(item => item.id === link.moveId);
          return next && (!link.hitOnly || previous.hitConfirmed) && !next.special && next.command.length === 1 && input?.pressed?.includes(next.command[0]!) && previous.moveFrame >= link.fromFrame && previous.moveFrame <= link.toFrame
            && (next.direction === undefined || next.direction === sampled.direction) && (next.drive === undefined || next.drive === !!input.drive)
            && (next.airborne === undefined || next.airborne === !!input.airborne) && previous.stamina >= (next.staminaCost ?? 0);
        });
        const launchedTarget = before.fighters.find(item => item.id === target?.id)?.stunKind === 'hit';
        const takingOff = !move && (input?.locomotionCost ?? 0) > 1 && previous.stamina >= (input?.locomotionCost ?? 0);
        // Lock-on finds neutral targets and assists the deliberate chase takeoff.
        // Once chasing a combo, links keep their heading; the stick aims follow-ups.
        const manualFollowup = !!definition.movement && launchedTarget && !takingOff;
        const steer = (move?.steering ?? .5) * .12;
        const aimY = definition.movement && motion.locked(entity.id) ? ((target?.position[1] ?? entity.position[1]) - entity.position[1]) / Math.max(.01, hypot(dx, dz)) * hypot(previous.facing.x, previous.facing.z) : previous.facing.y;
        const facing = move && !linking || manualFollowup ? { x: previous.facing.x + direction.x * steer, y: aimY, z: previous.facing.z + direction.z * steer }
          : motion.locked(entity.id) ? { x: dx || (dz ? 0 : 1), y: definition.movement ? (target?.position[1] ?? entity.position[1]) - entity.position[1] : 0, z: dz }
          : hypot(direction.x, direction.z) ? direction : { x: sin(entity.rotationY), y: 0, z: cos(entity.rotationY) };
        const body = runtime.physics.body(entity.id)!;
        return { fighterId: entity.id, position: { x: entity.position[0], y: entity.position[1], z: entity.position[2] }, facing, airborne: !surfaces.grounded.has(entity.id), velocity: { x: body.velocityX, y: body.velocityY, z: body.velocityZ } };
      });
      const interactionState = simulation.capture();
      // Physics advanced since the last combat snapshot; interaction reach must
      // resolve against the same current poses as this tick's strikes.
      for (const pose of poses) interactionState.fighters.find(fighter => fighter.id === pose.fighterId)!.position = { ...pose.position };
      const interactionEvents = interactions?.before(interactionState, inputs) ?? [];
      if (interactions) simulation.restore({ snapshot: interactionState });
      const events = [...interactionEvents, ...(runtime.diagnosticFeatures.combat ? simulation.step({ poses, collisions: surfaces.collisions, inputs, attackReachScales: interactions?.reachScales(interactionState, inputs), attackArcDegrees: interactions?.arcDegrees(interactionState, inputs), attackVisibility: interactions?.attackVisibility }) : [])];
      { const state = simulation.capture();const falls = fallout.resolve(state);if (falls.length) { events.push(...falls);simulation.restore({ snapshot: state }); } }
      if (environment && (!match || match.phase === 'fighting' || match.phase === 'practice')) {
        const state = simulation.capture();
        if (runtime.diagnosticFeatures.traffic && runtime.diagnosticFeatures.environmentMotion) events.push(...environment.traffic(state, before, definition.config, surfaces.grounded, world.tick, world.motionSeed ?? 0));
        if (runtime.diagnosticFeatures.hazards && runtime.diagnosticFeatures.environmentMotion) events.push(...environment.hazards(state, surfaces.grounded));
        simulation.restore({ snapshot: state });
      }
      if (interactions) { const state = simulation.capture();interactions.after(state, inputs, events);simulation.restore({ snapshot: state }); }
      if (environment) {
        const strikeState = simulation.capture(), contacts = environment.attack(strikeState, definition.config, interactions?.reachScales(strikeState, inputs));
        const impacts: CombatEvent[] = contacts.map(contact => ({ id: `${contact.frame}:terrain:${contact.actor}:${contact.entityId}`, frame: contact.frame, attackerId: contact.actor, targetId: contact.entityId, moveId: contact.moveId, kind: 'hit', damage: definition.config.moves.find(move => move.id === contact.moveId)?.damage ?? 0, impulse: { x: 0, y: 0, z: 0 } }));
        hitstop.contact(impacts);fighterInputs?.contact(impacts, strikeState);
      }
      // Detached once for synchronous read-only observers; no simulation mutation in this phase.
      const observed = simulation.capture();
      exchange.observe(before, observed, events);
      if (runtime.diagnosticFeatures.ai && ai && match?.phase === 'fighting' && opponent && player && !samples) { ai.observe({ state: observed, events, fighterId: opponent.entityId, targetId: player.entityId });if (match.theater) playerAi?.observe({ state: observed, events, fighterId: player.entityId, targetId: opponent.entityId });ai.outcomes.resolve({ events, level: match.difficulty, fighter: opponent.entityId });if (match.theater && player) ai.outcomes.resolve({ events, level: 9, fighter: player.entityId }); }
      if (match?.phase === 'practice' && player) practice.observe(before, events, inputs, player.entityId, surfaces.grounded);
      defenseFeedback.step({ before, after: observed, inputs, events });
      locomotionFx.step({ state: observed, grounded: surfaces.grounded, velocities: new Map(definition.fighters.map(fighter => { const velocity = { x: 0, y: 0, z: 0 };if (!runtime.physics.readVelocity(fighter.entityId, velocity)) throw Error(`Missing fighter body ${fighter.entityId}`);return [fighter.entityId, velocity]; })) });
      const strikeEvents = events.filter(event => event.defenseReason !== 'fire-exposure' && event.defenseReason !== 'out-of-bounds');
      hitstop.contact(strikeEvents, observed);
      fighterInputs?.contact(strikeEvents, observed);
      visualEvents = [...visualEvents.filter(event => tick - event.frame < 18), ...strikeEvents];
      const motionState = simulation.capture(), groundSpeedScales = new Map(environment?.groundSpeedScales);
      for (const [id, scale] of interactions?.movementScales(motionState, surfaces.grounded) ?? []) groundSpeedScales.set(id, Math.min(groundSpeedScales.get(id) ?? 1, scale));
      const suppressed = motion.step(motionState, actions, held, surfaces.grounded, controls, groundSpeedScales);
      if (definition.audio) audio.step({ before, after: simulation.capture(), events, interactions: [...interactions?.transitions ?? [], ...environment?.transitions.map(event => ({ kind: event.kind === 'warning' ? event.cause === 'impact' ? 'environment-strike' : 'environment-warning' : 'environment-removed', actor: event.entityId })) ?? []], grounded: surfaces.grounded, motion: motion.capture() });
      const after = simulation.capture();
      influence.contact(strikeEvents, after);
      runtime.applyCommands({ commands: events.filter(event => after.fighters.find(fighter => fighter.id === (event.kind === 'parry' ? event.attackerId : event.targetId))!.health > 0).map(event => ({ type: 'impulse', entityId: event.kind === 'parry' ? event.attackerId : event.targetId, value: [event.impulse.x, event.impulse.y, event.impulse.z] })) });
      if (runtime.diagnosticFeatures.koPhysics) knockout.step(after, events);
      held = nextHeld;
      return new Set([...suppressed, ...simulation.capture().fighters.filter(fighter => fighter.stunFrames > 0 || fighter.health <= 0).map(fighter => fighter.id), ...events.map(event => event.kind === 'parry' ? event.attackerId : event.targetId)]);
    },
    presentation(): GameplayPresentation3D {
      const base = combatPresentation3D({ state: simulation.capture(), definition, events: visualEvents });
      const presented = exchange.presentation(match ? match.presentation(base) : base);
      const result = match?.phase === 'practice' && !options.externalMatch ? practice.presentation(presented) : presented;
      if (interactions) {
        const state = simulation.capture(), channels = fighterInputs?.capture();
        result.interactionTargets = Object.fromEntries(definition.fighters.flatMap((fighter, index) => {
          const direction = channels?.[index]?.hitstop.previousDirection ?? (fighter.control === 'player' ? motion.direction(held) : undefined);
          const target = interactions.selectedTarget(state, fighter.entityId, direction);
          return target ? [[fighter.entityId, target]] : [];
        }));
      }
      return result;
    },
  };
}

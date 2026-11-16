import type { CombatAiPolicy } from './combat-ai/policy/trained.ts';
import type { CombatAiTuning, CombatAiProfile } from './combat-ai/policy/instrumentation.ts';
import type { CombatAiLearning } from './combat-ai/learning/model.ts';
import type { CombatAiDecisionOverride } from './combat-ai/policy/override.ts';
import type { CombatFramePresentation3D } from './combat-presentation.ts';
import { useSharedPresentationCapture, type PresentationCaptureStrategy, type PresentationCaptureWork, type PresentationObserverContract } from './presentation-capture.ts';
import { tuple3 } from "../../math/tuples.ts";
import type { RigidContactSnapshot3D } from '../../physics/rigid-3d.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../frame/3d.ts';
import { createProjectCombat3D } from './combat-gameplay.ts';
import { createProjectPlay3D } from './play/session.ts';
import type { CombatFighterInput3D } from './combat-fighter-inputs.ts';
import type { CombatVector } from '../../combat/config.ts';
import type { Hyperfocus3DRuntime, Hyperfocus3DSnapshot } from '../runtime-3d.ts';
import { isHyperfocus3DSnapshot } from '../runtime-3d.ts';
import { object, readGameplayAudio3D, readGameplayPresentation3D, readGameplayState3D, type GameplayAudio3D, type GameplayContext3D, type GameplayPresentation3D, type GameplayValue3D } from './gameplay-contracts.ts';
import { validateRuntimeCommands3D, type RuntimeCommand3D } from './runtime-commands.ts';
import { readGameplayContinuation3D } from './gameplay/snapshot-reader.ts';

type ScriptComponent = { id: string; type: string; enabled: boolean; values: Record<string, string | number | boolean> };
export type GameplayProject3D = {
  activeSceneId: string; scenes: Array<{ id: string; entities: Array<{ components: ScriptComponent[] }> }>;
  assets?: Array<{ id: string; mimeType?: string }>;
  extensions?: Record<string, unknown>;
};
export type GameplaySnapshot3D = Hyperfocus3DSnapshot & {
  play?: ReturnType<NonNullable<ReturnType<typeof createProjectPlay3D>>['capture']>;
  combat?: ReturnType<NonNullable<ReturnType<typeof createProjectCombat3D>>['capture']>;
  gameplay?: { version: 1; states: Record<string, Record<string, GameplayValue3D>>; velocities: Array<{ id: string; value: [number, number, number] }>; held?: string[]; firstStep?: boolean; contacts?: RigidContactSnapshot3D };
};

/** Runs existing project-script bindings against the shared DOM-free 3D world. */
export function createGameplay3D(options: { project: GameplayProject3D; runtime: Hyperfocus3DRuntime; behaviors?: Readonly<Record<string, unknown>>; combatQueueSeed?: number; combatAiPolicies?: readonly [CombatAiPolicy | undefined, CombatAiPolicy | undefined]; combatAiTuning?: readonly [CombatAiTuning | undefined, CombatAiTuning | undefined]; combatAiLearning?: readonly [CombatAiLearning | undefined, CombatAiLearning | undefined]; combatAiProfile?: CombatAiProfile; combatAiDecisionOverride?: CombatAiDecisionOverride; independentCombatInputs?: boolean; externalCombatMatch?: boolean; externalCombatMode?: 'set' | 'training' }) {
  const { project, runtime } = options, initial = runtime.snapshot();
  if (project.extensions?.hyperfocusPlay && project.extensions?.hyperfocusCombat) throw new Error('Play and combat cannot both own the player runtime.');
  const play = createProjectPlay3D(project.extensions?.hyperfocusPlay, runtime);
  const combat = createProjectCombat3D({ extension: project.extensions?.hyperfocusCombat, runtime, queueSeed: options.combatQueueSeed, combatAiPolicies: options.combatAiPolicies, combatAiTuning: options.combatAiTuning, combatAiLearning: options.combatAiLearning, combatAiProfile: options.combatAiProfile, combatAiDecisionOverride: options.combatAiDecisionOverride, independentInputs: options.independentCombatInputs, externalMatch: options.externalCombatMatch, externalMode: options.externalCombatMode });
  if (options.independentCombatInputs && !combat) throw new Error('Independent combat inputs require authored combat.');
  const bindings = project.scenes.find(s => s.id === project.activeSceneId)?.entities.flatMap(e => e.components)
    .filter(c => c.enabled && c.type === 'behavior' && typeof c.values.module === 'string' && !c.values.module.startsWith('builtin:')) ?? [];
  const implementations = bindings.map(component => {
    const key = `${component.values.module}#${component.values.export ?? 'update'}`, implementation = options.behaviors?.[key];
    if (typeof implementation !== 'function') throw new Error(`3D project behavior ${key} was not compiled. Enable project source for Play or include it in the build.`);
    return { component, implementation };
  });
  const audioAssets = new Set(project.assets?.filter(a => a.mimeType?.startsWith('audio/')).map(a => a.id));
  const entityIds = new Map(initial.entities.map(e => [e.id, e]));
  let states: Record<string, Record<string, GameplayValue3D>> = {}, held = new Set<string>(), presentation: GameplayPresentation3D | undefined;
  let pendingAudio: GameplayAudio3D[] = [], firstStep = true;
  const bodies = () => initial.entities.flatMap(e => { const body = runtime.physics.body(e.id);return body ? [{ id: e.id, type: body.type, position: tuple3(body.x, body.y, body.z), velocity: tuple3(body.velocityX, body.velocityY, body.velocityZ) }] : []; });
  const snapshot = (): GameplaySnapshot3D => ({ ...runtime.snapshot(), ...(play ? { play: play.capture() } : {}), ...(combat ? { combat: combat.capture() } : {}), gameplay: { version: 1, states: structuredClone(states), velocities: bodies().filter(b => b.type === 'dynamic').map(b => ({ id: b.id, value: b.velocity })), held: [...held], firstStep, contacts: runtime.physics.captureContactState() } });
  function advance(actions: Iterable<string> = [], fighterInputs?: readonly CombatFighterInput3D[], localDirection?: CombatVector) {
      combat?.validateInputs(fighterInputs);
      const nextHeld = new Set(actions), pressed = [...nextHeld].filter(a => !held.has(a)), world = implementations.length ? runtime.snapshot() : undefined;
      const nextStates = { ...states }, commands: RuntimeCommand3D[] = [], audio: GameplayAudio3D[] = [];
      let nextPresentation = presentation;
      if (world) for (const { component, implementation } of implementations) {
        const context: GameplayContext3D = { tick: world.tick, deltaSeconds: 0.016666666666666666, firstStep, actions: [...nextHeld], pressed, state: structuredClone(states[component.id] ?? {}), component: structuredClone(component), snapshot: structuredClone(world), bodies: bodies() };
        const result: unknown = Reflect.apply(implementation, undefined, [context]);if (result === undefined) continue;
        const value = object(result);
        if (value.state !== undefined) nextStates[component.id] = readGameplayState3D(value.state);
        if (value.commands !== undefined) commands.push(...validateRuntimeCommands3D(value.commands, entityIds, runtime.physics));
        if (value.presentation !== undefined) nextPresentation = readGameplayPresentation3D(value.presentation);
        if (value.audio !== undefined) audio.push(...readGameplayAudio3D(value.audio, audioAssets));
      }
      if (pendingAudio.length + audio.length > 256) throw new Error('Drain 3D audio commands before advancing more steps.');
      runtime.applyCommands({ commands });
      const suppressedControllerIds = play?.step(nextHeld, pressed) ?? combat?.step(nextHeld, fighterInputs, localDirection);
      audio.push(...combat?.drainAudio() ?? []);
      states = nextStates;presentation = nextPresentation;pendingAudio.push(...audio);held = nextHeld;firstStep = false;
      if (!combat?.frozen) runtime.advance({ actions: nextHeld, suppressedControllerIds, platformPositions: combat?.platformPositions });
  }
  const presentationVelocity = { x: 0, y: 0, z: 0 };
  function readPresentation(options: { entityIds: readonly string[] }, capturedCombat?: NonNullable<GameplaySnapshot3D['combat']>, work?: PresentationCaptureWork): GameplaySnapshot3D & { renderOnly: true } {
    const entities = options.entityIds.map(id => runtime.entityState(id));
    const velocities = options.entityIds.flatMap(id => {
      return runtime.physics.readVelocity(id, presentationVelocity) === 'dynamic' ? [{ id, value: tuple3(presentationVelocity.x, presentationVelocity.y, presentationVelocity.z) }] : [];
    });
    return { version: 1, renderOnly: true, sceneId: initial.sceneId, tick: runtime.tick, entities,
      ...(runtime.motionSeed ? { motionSeed: runtime.motionSeed } : {}),
      ...(play ? { play: play.capture() } : {}), ...(combat ? { combat: capturedCombat ?? combat.capture(work) } : {}),
      gameplay: { version: 1, states: {}, velocities } };
  }
  let sharedCaptureActive = false;
  return {
    /** Local fixed-content rollback. Custom behavior closures are not checkpointable. */
    checkpoint() {
      if (implementations.length) throw new Error('Gameplay rollback requires authored built-in behavior; custom script closure state cannot be checkpointed.');
      const world = runtime.checkpoint(), fight = combat?.checkpoint(), playing = play?.capture();
      const state = structuredClone({ states, held: [...held], firstStep });
      const displayed = structuredClone({ presentation, pendingAudio });
      return { state: { ...state, world: world.state, combat: fight?.state }, restore() {
        world.assertValid();
        fight?.restore();world.restore();if (playing) play!.restore(playing);
        states = structuredClone(state.states);held = new Set(state.held);firstStep = state.firstStep;
        presentation = structuredClone(displayed.presentation);pendingAudio = structuredClone(displayed.pendingAudio);
      } };
    },
    snapshot,
    /** Detached counters per physics owner. Hits and overflows are cumulative within each world's lifetime. */
    readPhysicsDiagnostics() { return { runtime: { ...runtime.physics.diagnostics }, knockout: combat?.physicsDiagnostics() }; },
    /** Detached selected-entity view for rendering. Never restore this as a save or rollback checkpoint. */
    readPresentation(options: { entityIds: readonly string[] }): GameplaySnapshot3D & { renderOnly: true } {
      return readPresentation(options);
    },
    /** Present then return a detached selected-entity view. Independent is the
     * default. Shared captures combat once per invocation, never by tick, and
     * is supported only for built-in combat. Runtime entities are still read
     * after presentation. No frame or capture is retained by this operation.
     *
     * Callbacks use the independent path unless observerContract is read-only.
     * That explicit caller obligation forbids gameplay/runtime mutation,
     * capture mutation/retention and reentry; evaluated frame/camera changes
     * remain allowed. onPresented is a synchronous host timing boundary.
     * sharedCompositeCaptureMs is an additional completion stage in shared mode.
     */
    presentAndReadPresentation(frame: Hyperfocus3DEvaluatedFrame, options: {
      entityIds: readonly string[]; presentation?: CombatFramePresentation3D;
      capture?: PresentationCaptureStrategy; observerContract?: PresentationObserverContract;
      onPresented?(): void; work?: PresentationCaptureWork;
    }): GameplaySnapshot3D & { renderOnly: true } {
      if (sharedCaptureActive) throw Error('Shared presentation capture cannot be reentered.');
      const presentation = options.presentation ?? {};
      const shared = useSharedPresentationCapture({ ...options, supported: !!combat && !play,
        hasCallbacks: !!(presentation.onPresentationStage || presentation.cameraTransform || options.onPresented) });
      if (!shared) {
        combat?.presentFrame(frame, presentation, undefined, options.work);play?.presentFrame(frame, presentation);
        options.onPresented?.();return readPresentation(options, undefined, options.work);
      }
      sharedCaptureActive = true;
      try {
        const captured = combat!.capture(options.work);
        presentation.onPresentationStage?.('sharedCompositeCaptureMs');
        combat!.presentFrame(frame, presentation, captured, options.work);
        options.onPresented?.();return readPresentation(options, captured, options.work);
      } finally { sharedCaptureActive = false; }
    },
    setAudioListener(options: { fighterId?: string } = {}) { combat?.setAudioListener(options); },
    queueCombatAiPolicies(options: { policies: readonly [CombatAiPolicy | undefined, CombatAiPolicy | undefined] }) { combat?.queueCombatAiPolicies(options); },
    queueCombatAiLearning(options: { models: readonly [CombatAiLearning | undefined, CombatAiLearning | undefined] }) { combat?.queueCombatAiLearning(options); },
    aiReport() { return combat?.aiReport(); },
    combatAiLearning() { return combat?.aiLearning(); },
    combatState() { return combat?.state(); },
    startCombatAiLearningEvidence() { combat?.startAiLearningEvidence(); },
    combatAiLearningEvidence() { return combat?.aiLearningEvidence(); },
    finishCombatAiLearningEvidence() { return combat?.finishAiLearningEvidence(); },
    /** Optional stage observer runs at combat presentation boundaries; the host owns clocks and retention. */
    presentFrame(frame: Hyperfocus3DEvaluatedFrame, presentation: CombatFramePresentation3D = {}) { combat?.presentFrame(frame, presentation);play?.presentFrame(frame, presentation); },
    get presentation() { return presentation ?? play?.presentation() ?? combat?.presentation(); },
    get active() { return implementations.length > 0 || Boolean(combat || play); },
    get handlesStart() { return combat?.handlesStart ?? false; },
    /** Advance gameplay without allocating a save/rollback snapshot. */
    advance(options: { actions?: Iterable<string>; fighterInputs?: readonly CombatFighterInput3D[]; localDirection?: CombatVector } = {}) { advance(options.actions, options.fighterInputs, options.localDirection); },
    combatMatch() { return combat?.matchState(); },
    step(actions: Iterable<string> = [], fighterInputs?: readonly CombatFighterInput3D[], localDirection?: CombatVector) { advance(actions, fighterInputs, localDirection);return snapshot(); },
    drainAudio() { const audio = pendingAudio;pendingAudio = [];return audio; },
    reset() { states = {};held.clear();presentation = undefined;pendingAudio = [];firstStep = true;runtime.restore(initial);combat?.reset();play?.reset();return snapshot(); },
    restore(value: unknown) {
      if (!isHyperfocus3DSnapshot(value)) throw new Error('Invalid saved 3D world.');
      const raw = object(value), gameplay = raw.gameplay === undefined ? undefined : object(raw.gameplay);
      if (gameplay && gameplay.version !== 1) throw new Error('Unknown saved 3D gameplay version.');
      if (gameplay) readGameplayContinuation3D({ ...gameplay, velocities: gameplay.velocities ?? [], held: gameplay.held ?? [] });
      const savedHeld = gameplay?.held ?? [];
      if (!Array.isArray(savedHeld) || savedHeld.length > 256 || savedHeld.some(action => typeof action !== 'string' || action.length > 256)) throw new Error('Invalid saved 3D gameplay inputs.');
      if (gameplay?.firstStep !== undefined && typeof gameplay.firstStep !== 'boolean') throw new Error('Invalid saved 3D gameplay lifecycle.');
      const nextHeld = new Set<string>(savedHeld);
      const nextStates = gameplay ? Object.fromEntries(Object.entries(object(gameplay.states)).map(([id, state]) => {
        if (!bindings.some(b => b.id === id)) throw new Error(`Saved 3D behavior ${id} is not in this project.`);
        return [id, readGameplayState3D(state)];
      })) : {};
      const velocityRecords = gameplay?.velocities ?? [];
      if (!Array.isArray(velocityRecords) || velocityRecords.length > initial.entities.length) throw new Error('Invalid saved 3D velocities.');
      const velocityCommands = validateRuntimeCommands3D(velocityRecords.map(raw => { const v = object(raw);return { type: 'velocity', entityId: v.id, value: v.value }; }), entityIds, runtime.physics);
      if (new Set(velocityCommands.map(command => command.entityId)).size !== velocityCommands.length) throw new Error('Duplicate saved 3D velocities.');
      if (combat && raw.combat !== undefined) combat.validate(raw.combat);
      if (play && raw.play !== undefined) play.validate(raw.play);
      if (!play && raw.play !== undefined) throw new Error('Saved play state has no project binding.');
      // Legacy saves have no solver history. Never inherit pre-load contacts.
      const contacts = runtime.physics.validateContactState(gameplay?.contacts === undefined ? { version: 1, contacts: [] } : gameplay.contacts);
      // Runtime validates the complete scene snapshot before mutation. All other
      // save members were checked above, so a rejected restore changes nothing.
      runtime.restore(value);
      if (combat) { if (raw.combat !== undefined) combat.restore(raw.combat);else combat.resetState(); }
      if (play) { if (raw.play !== undefined) play.restore(raw.play);else play.resetState(); }
      runtime.physics.restoreContactState(contacts);
      runtime.applyCommands({ commands: velocityCommands });states = nextStates;held = nextHeld;pendingAudio = [];presentation = undefined;firstStep = gameplay?.firstStep ?? true;return snapshot();
    },
  };
}
export type Gameplay3D = ReturnType<typeof createGameplay3D>;

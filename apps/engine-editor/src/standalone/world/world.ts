import { createRenderFramePacket3D } from '@hyperfocus/engine/experimental';
import { createSimulationMailbox } from '@hyperfocus/engine/experimental/simulation-mailbox';
import { createGameplay3D, createHyperfocus3DRuntime, applyAppearance3D, applyAppearanceMotion3D } from '@hyperfocus/engine/project/runtime-3d';
import { createDirectedFighterPresenter } from '@hyperfocus/touch-of-death/presentation/art-direction/integration/runtime';
import { presentServiceCourt } from '@hyperfocus/touch-of-death/presentation/city/service-entrance';
import { combatScreenEffects } from '../../scene3d/fight-hud/screen-effects.ts';
import { createFrameRecordSelection, readCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { createLocalWorldSession, type LearningStore, type SessionCommand } from './session.ts';
import { createSubmittedPoseIdentity } from './provenance/pose.ts';
import type { WorldInit, WorldInput } from './protocol.ts';
export type { WorldInit, WorldInput } from './protocol.ts';

export type WorldCommand = SessionCommand | { type: 'suspend'; suspended: boolean } | { type: 'review-save' };
/** Queuing next-match AI revisions must not discard current-fight input. */
export function resetsWorldInput(command: WorldCommand) {
  return !['snapshot', 'review-save', 'policies', 'learning'].includes(command.type);
}

/** Game-specific adapter; the persistent clock, simulation, scene and packet contracts come from the engine. */
export async function createWorld(init: WorldInit, store?: LearningStore) {
  const runtime = await createHyperfocus3DRuntime(init.project, init.assets);
  const game = createGameplay3D({ project: init.project, runtime, ...init.gameplayOptions });
  game.restore(init.checkpoint);
  const physicalPerformance = init.timeline ? runtime.compilePhysicalPerformance(init.timeline) : undefined;
  const directed = createDirectedFighterPresenter({ project: init.project, runtime, assets: init.assets });
  const definition = readCombatProject3D(init.project.extensions?.hyperfocusCombat);
  const fighterIds = new Set(definition?.fighters.map(f => f.entityId));
  const presentedIds = init.checkpoint.entities.filter(entity => fighterIds.has(entity.id)).map(entity => entity.id);
  const barIds = new Set([...fighterIds].flatMap(id => [id, ...['', ':art'].flatMap(prefix => ['head', 'left-hand', 'right-hand', 'left-shoe', 'right-shoe', 'left-foot', 'right-foot'].map(part => `${id}${prefix}:${part}`))]));
  const packet = createRenderFramePacket3D({ commands: runtime.compile(), scene: runtime.scene });
  const poseIdentity = init.provenance ? createSubmittedPoseIdentity({ commands: runtime.compile(), scene: runtime.scene }) : undefined;
  const selectBars = createFrameRecordSelection({ ids: runtime.declaration.scenes.find(scene => scene.id === runtime.declaration.activeSceneId)!.entities.filter(entity => barIds.has(entity.id)).map(entity => entity.id) });
  if (init.learning && init.services === 'full' && !store) throw Error('Learning storage adapter is required');
  const session = createLocalWorldSession({ game, review: init.services !== undefined && init.services !== 'none', store: init.services === 'full' && init.learning ? store : undefined, diagnostic: init.diagnostic });
  const presentation = { ...init.presentation };
  let currentInput = init.input;
  let requestId = 0, stepId = 0, stateCommit = 0, discontinuity = 0, stateProducedAtMs: number | undefined;
  let stepSpans: Array<{ stepId: number; stateCommit: number; startAtMs: number; endAtMs: number; runtimeTick: number }> = [];
  let inputReceivedAtMs: number | undefined;
  const makeMailbox = (nowMs: number) => createSimulationMailbox<WorldInput, string>({ input: currentInput, nowMs, stepMs: 16.666666666666668, maxCatchUpMs: 250, maxEvents: 64,
    advance(input, events) {
      const startAtMs = init.provenance ? performance.timeOrigin + performance.now() : 0;
      session.advance(new Set([...input.actions, ...events]), input.localDirection);
      if (init.provenance) {
        stateProducedAtMs = performance.timeOrigin + performance.now();
        stepSpans.push({ stepId: ++stepId, stateCommit: ++stateCommit, startAtMs, endAtMs: stateProducedAtMs, runtimeTick: runtime.tick });
      }
    },
  });
  let mailbox = makeMailbox(0), revision = 0, suspended = false;
  let diagnosticPrevious: { phase?: string; camera: number[]; health: number; tick: number } | undefined;
  return {
    bytes: packet.byteLength,
    snapshot: game.snapshot,
    mailbox: () => mailbox.snapshot(),
    services: session.stats,
    command(command: WorldCommand, nowMs: number) {
      const exchange = command.type === 'review-save' ? session.saveReview() : undefined;
      const state = command.type === 'suspend' || command.type === 'review-save' ? game.snapshot() : session.command(command);
      if (command.type === 'suspend') suspended = command.suspended;
      if (init.provenance && !['snapshot', 'review-save'].includes(command.type)) {
        stateCommit++;stateProducedAtMs = performance.timeOrigin + performance.now();
      }
      if (resetsWorldInput(command)) {
        currentInput = { ...currentInput, actions: [], localDirection: undefined };
        mailbox.dispose();mailbox = makeMailbox(nowMs);revision++;
        if (init.provenance) discontinuity++;
      }
      return { state, revision, suspended, services: session.stats(), exchange };
    },
    render(buffer: ArrayBuffer, nowMs: number) {
      if (init.provenance) { requestId++;stepSpans = []; }
      const started = performance.now(), clock = mailbox.advance(nowMs, suspended || currentInput.paused);
      const input = clock.input, afterSimulation = performance.now();
      presentation.reducedMotion = input.reducedMotion ?? init.presentation.reducedMotion;
      const detailed: Record<string, number> = {};let stage = afterSimulation;
      const mark = (name: string) => { if (init.diagnostic) { const end = performance.now();detailed[name] = end - stage;stage = end; } };
      const frame = runtime.sampleFrame({ timeline: init.timeline, physicalPerformance, viewport: { width: input.width, height: input.height } });mark('sampleMs');
      let presentationStage = stage;
      const onPresentationStage = init.diagnostic ? (name: string) => { const end = performance.now();detailed[name] = end - presentationStage;presentationStage = end; } : undefined;
      const { renderOnly: _renderOnly, ...snapshot } = game.readPresentation({ entityIds: presentedIds });mark('snapshotMs');
      presentationStage = stage;
      const gameStarted = stage;let hostPresentationMs = 0;
      game.presentFrame(frame, { ...presentation, viewportAspect: input.width / input.height, cameraTransform: camera => presentServiceCourt({ ...frame, camera }), onPresentationStage,
        beforeVisibility(frame) {
          const hostStarted = init.diagnostic ? performance.now() : 0;stage = hostStarted;
          for (const resolved of init.looks) {
            applyAppearance3D(frame, resolved);applyAppearanceMotion3D({ frame, resolved, state: snapshot.combat?.state, reducedMotion: presentation.reducedMotion });
          }
          mark('appearanceMs');directed?.present(frame, snapshot, presentation);mark('fighterPresentationMs');
          if (init.diagnostic) { hostPresentationMs = stage - hostStarted;presentationStage += hostPresentationMs; }
        } });
      if (init.diagnostic) { stage = performance.now();detailed.gamePresentationMs = stage - gameStarted - hostPresentationMs; }
      const afterPresentation = performance.now();
      runtime.applyFrame(frame);mark('applyMs');
      const applied = init.provenance ? performance.now() : 0;
      const commands = runtime.compile();mark('compileOnlyMs');
      const compiled = init.provenance ? performance.now() : 0;
      packet.write({ buffer, commands, scene: runtime.scene });mark('packetWriteMs');
      const packed = init.provenance ? performance.now() : 0;
      const matrix = runtime.viewProjectionForFrame(frame, input.width / input.height);
      const done = performance.now();
      if (init.diagnostic) {
        const combat = snapshot.combat, fighters = combat?.state.fighters ?? [], physics = runtime.physics.diagnostics;
        const knockoutPhysics = game.readPhysicsDiagnostics().knockout;
        const health = fighters.reduce((sum, fighter) => sum + fighter.health, 0);
        Object.assign(detailed, {
          sampledEntities: frame.entities.length, sampledMaterials: frame.materials.length,
          visibleEntities: frame.entities.reduce((sum, entity) => sum + Number(entity.visible), 0),
          cutawayMaterials: frame.materials.reduce((sum, material) => sum + Number(!!material.look.cutaway), 0),
          effectParticles: frame.effects.reduce((sum, effect) => sum + effect.particles.length, 0),
          knockoutRigs: combat?.knockout.length ?? 0, attackingFighters: fighters.filter(fighter => !!fighter.moveId).length,
          stunnedFighters: fighters.filter(fighter => fighter.stunFrames > 0).length,
          environmentWarnings: combat?.environment?.surfaces.filter(surface => surface.phase === 'warning').length ?? 0,
          environmentRemoved: combat?.environment?.surfaces.filter(surface => surface.phase === 'removed').length ?? 0,
          matchIndex: combat?.match?.matchIndex ?? 0, roundsCompleted: (combat?.match?.playerWins ?? 0) + (combat?.match?.opponentWins ?? 0),
          phaseChanged: Number(!!diagnosticPrevious && diagnosticPrevious.phase !== combat?.match?.phase),
          tickRewound: Number(!!diagnosticPrevious && snapshot.tick < diagnosticPrevious.tick),
          damageSincePresentation: diagnosticPrevious ? Math.max(0, diagnosticPrevious.health - health) : 0,
          cameraTravel: diagnosticPrevious ? Math.hypot(...frame.camera.position.map((value, axis) => value - diagnosticPrevious!.camera[axis]!)) : 0,
          physicsCandidatePairs: physics.candidatePairs, physicsContacts: physics.contacts, physicsCcdTests: physics.ccdTests,
          physicsCcdHits: physics.ccdHits, physicsCcdAngularTests: physics.ccdAngularTests, physicsConstraints: physics.constraints,
          physicsCcdEligiblePairs: physics.ccdEligiblePairs, physicsCcdBoundsRejects: physics.ccdBoundsRejects,
          physicsCcdTestOverflows: physics.ccdTestOverflows,
          ...(knockoutPhysics && {
            knockoutPhysicsSteps: knockoutPhysics.steps, knockoutPhysicsBodies: knockoutPhysics.bodies,
            knockoutPhysicsCandidatePairs: knockoutPhysics.candidatePairs, knockoutPhysicsContacts: knockoutPhysics.contacts,
            knockoutPhysicsCcdTests: knockoutPhysics.ccdTests, knockoutPhysicsCcdHits: knockoutPhysics.ccdHits,
            knockoutPhysicsCcdEligiblePairs: knockoutPhysics.ccdEligiblePairs, knockoutPhysicsCcdBoundsRejects: knockoutPhysics.ccdBoundsRejects,
            knockoutPhysicsCcdAngularTests: knockoutPhysics.ccdAngularTests, knockoutPhysicsCcdTestOverflows: knockoutPhysics.ccdTestOverflows,
            knockoutPhysicsConstraints: knockoutPhysics.constraints,
          }),
        });
        diagnosticPrevious = { phase: combat?.match?.phase, camera: [...frame.camera.position], health, tick: snapshot.tick };
        detailed.diagnosticWorkMs = performance.now() - done;
      }
      const identityStarted = init.provenance ? performance.now() : 0;
      const pose = poseIdentity?.observe({ commands, matrix, camera: frame.camera.position, epoch: discontinuity });
      const identityEnded = init.provenance ? performance.now() : 0;
      const provenance = init.provenance ? {
        schema: 2 as const, owner: init.provenance.owner, requestId, discontinuity, stateCommit, stateIdentityKind: 'committed-update-sequence' as const,
        runtimeTick: snapshot.tick, combatFrame: snapshot.combat?.state.frame, stepSpans, pose,
        stateProducedAtMs, inputReceivedAtMs, clockOriginMs: performance.timeOrigin,
        producerStartAtMs: performance.timeOrigin + started, simulationEndAtMs: performance.timeOrigin + afterSimulation,
        preparationStartAtMs: performance.timeOrigin + afterSimulation, applicationStartAtMs: performance.timeOrigin + afterPresentation,
        preparationEndAtMs: performance.timeOrigin + applied, compileEndAtMs: performance.timeOrigin + compiled,
        packetWrittenAtMs: performance.timeOrigin + packed, identityMs: identityEnded - identityStarted,
        producerPublishAtMs: 0, totalProducerWallMs: 0,
      } : undefined;
      const output = {
        frame: { ...frame, entities: selectBars(frame.entities), materials: [] },
        // HUD projection only, never a restorable checkpoint. configKey is a 309 KB invariant rules string.
        snapshot: { ...snapshot, entities: snapshot.entities.filter(entity => fighterIds.has(entity.id)), gameplay: undefined,
          combat: snapshot.combat && { ...snapshot.combat, state: { ...snapshot.combat.state, configKey: '' } } },
        effects: combatScreenEffects({ snapshot, definition, reducedMotion: presentation.reducedMotion }),
        presentation: game.presentation, handlesStart: game.handlesStart, paused: suspended || input.paused, audio: game.drainAudio(), matrix,
        steps: clock.steps, droppedMs: clock.droppedMs, sequence: clock.sequence, appliedSequence: clock.appliedSequence,
        sampledAtMs: clock.sampledAtMs, appliedSampledAtMs: clock.appliedSampledAtMs, sampledWorldAtMs: nowMs,
        simulationMs: afterSimulation - started, presentationMs: afterPresentation - afterSimulation, compileMs: done - afterPresentation,
        computeMs: done - started, physics: { ...runtime.physics.diagnostics }, revision, detailed, services: session.stats(), provenance,
      };
      if (init.diagnostic) detailed.metadataMs = performance.now() - done;
      if (provenance) {
        const ended = performance.now();provenance.producerPublishAtMs = performance.timeOrigin + ended;provenance.totalProducerWallMs = ended - started;
        if (init.provenance?.trace) { performance.mark('hf:producer', { detail: provenance });performance.clearMarks('hf:producer'); }
      }
      return { buffer, output };
    },
    update(update: Parameters<typeof mailbox.offer>[0]) { const received = init.provenance ? performance.timeOrigin + performance.now() : undefined;const accepted = mailbox.offer(update);if (accepted) { currentInput = update.input;inputReceivedAtMs = received; }return accepted; },
    async flush() { await session.flush(); },
    async dispose() { mailbox.dispose();poseIdentity?.dispose();await session.dispose(); },
  };
}

export type WorldFrame = ReturnType<Awaited<ReturnType<typeof createWorld>>['render']>;

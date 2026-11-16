import { createWorldHost } from './host';
import { createGpuTimer } from '@hyperfocus/performance/browser-gpu-timer';
import { canonicalSubmittedPose } from './provenance/pose-oracle';
import { createWebGlCommandCapture } from './provenance/webgl-commands';
import { createDiagnosticMultisampleTarget } from './provenance/multisample-target';
import { lockLocalWorldLaunchers } from './local-modes';
import type { WorldFrame, WorldInit } from './world';
import { createRenderFramePacket3D as createWorldPacket } from '@hyperfocus/engine/experimental';
import { resolveAppearance3D as resolveWorldLook, type GameplaySnapshot3D, type readCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import type { Project3D, Standalone3DHook } from '../../standalone-3d';
import type { createStandaloneWorldAuthority } from '../world-authority';
import type { PhotoCapturePresentation } from '../capture/presentation';
import type { createStandaloneControls } from '../../components/standalone-controls';
import type { createCombatInputView } from '../../scene3d/input/combat-view/view';
import type { createStandaloneRewards } from '../../scene3d/rewards/standalone';
import type { createWebGl2Renderer3D } from '@hyperfocus/engine/render/3d-webgl2';
import type { createGameplayShadows3D } from '@hyperfocus/touch-of-death/presentation/shadows';
import type { createCanonicalImpactOverlay, createCanonicalImpactTextureSources } from '../../scene3d/canonical-impact-frame';
import type { createGameplayPresentation3D } from '../../scene3d/presentation/gameplay-presentation';
import type { createGamepadMenu } from '../../scene3d/input/gamepad-menu';
import type { createRuntimeControls } from '../../scene3d/input/runtime-controls';
import type { createPauseInputGate } from '../../scene3d/input/pause-input';
import type { createDriveTapInput } from '../../scene3d/input/drive-tap';
import type { createStandaloneAudioController } from '../../standalone-audio';
import type { createFighterBars } from '../../scene3d/fight-hud/fighter-bars';
import type { createGameplayPostProcess3D } from '../../scene3d/presentation/gameplay-postprocess';
import type { createStandaloneAppearance } from '../../scene3d/appearance/standalone';
import type { createStandaloneUploads } from '../../scene3d/uploads/standalone';
import type { createBulkTrainingPanel } from '../../scene3d/bulk-training/panel';
import type { createLiveCombatLearning } from '../../scene3d/bulk-training/adaptation/live';
import type { createGameFrameScheduler } from '../../scene3d/performance/frame-scheduler';
import type { createGamePerformance } from '../../scene3d/performance/settings';
import type { createPracticeLibrary } from '../../scene3d/replay/practice-library';
import { controllerPresentation, type create3DInputDevice } from '../../scene3d/gamepad-input';
import { acceptsPhysicalCombatAction } from '../../scene3d/input/physical-actions';
import { gameplayAudioCommand } from '../../audio-playback/gameplay-command';
import { personalMusicState } from '../../audio-playback/combat-effects';
import { combatControlPresentation } from '../../scene3d/fight-hud/control-hint';
import { localExchangePresentation } from '../../scene3d/replay/local-presentation';

/** Optional browser owner. The ordinary entry imports this contract only as a type. */
export function createStandaloneWorldController(bindings: {
  workerSource: string; project: Project3D; assets: WorldInit['assets']; canvas: HTMLCanvasElement; hook: Standalone3DHook;
  runtime: Parameters<typeof createWorldHost>[0]['runtime']; combat: ReturnType<typeof readCombatProject3D>;
  timeline: WorldInit['timeline']; contextualStore: Parameters<typeof createWorldHost>[0]['store'];
  learnedPolicy: NonNullable<WorldInit['gameplayOptions']['combatAiPolicies']>[number];
  learnedModel: NonNullable<WorldInit['gameplayOptions']['combatAiLearning']>[number];
  worldAuthority: ReturnType<typeof createStandaloneWorldAuthority>;
  controls: ReturnType<typeof createStandaloneControls>; inputView: ReturnType<typeof createCombatInputView>;
  renderer: ReturnType<typeof createWebGl2Renderer3D>; shadows: ReturnType<typeof createGameplayShadows3D>;
  postProcess: ReturnType<typeof createGameplayPostProcess3D>; impactOverlay: ReturnType<typeof createCanonicalImpactOverlay> | undefined;
  impactTextures: ReturnType<typeof createCanonicalImpactTextureSources> | undefined;
  gameplayUi: ReturnType<typeof createGameplayPresentation3D> | undefined;
  fighterBars: ReturnType<typeof createFighterBars> | undefined; appearance: ReturnType<typeof createStandaloneAppearance>;
  uploads: ReturnType<typeof createStandaloneUploads>; rewards: ReturnType<typeof createStandaloneRewards> | undefined;
  audio: ReturnType<typeof createStandaloneAudioController>; pauseInput: ReturnType<typeof createPauseInputGate>;
  padMenu: ReturnType<typeof createGamepadMenu>; inputSettings: ReturnType<typeof createRuntimeControls>; inputDevice: ReturnType<typeof create3DInputDevice>;
  driveTap: ReturnType<typeof createDriveTapInput>; held: Set<string>; bindingTaps: Set<string>;
  frameScheduler: Pick<ReturnType<typeof createGameFrameScheduler>, 'schedule' | 'wake'>;
  gamePerformance: ReturnType<typeof createGamePerformance>; diagnostics: unknown[];
  liveLearning: ReturnType<typeof createLiveCombatLearning> | undefined; bulkTraining: ReturnType<typeof createBulkTrainingPanel> | undefined;
  practiceLibrary: ReturnType<typeof createPracticeLibrary> | undefined;
  readonly reducedMotion: boolean; capturePresentation: PhotoCapturePresentation | undefined;
  clear(): void; editingText(): boolean | undefined; takePointerPause(): boolean; rebase(): void; requireStart(): void;
  mainSnapshot(): GameplaySnapshot3D; renderOracle(now: number): void;
}) {
  const { project, assets, canvas, hook, runtime, combat, timeline, contextualStore, learnedPolicy, learnedModel,
    worldAuthority, controls, inputView, renderer, shadows, postProcess, impactOverlay, impactTextures, gameplayUi,
    fighterBars, appearance, uploads, rewards, audio, pauseInput, padMenu, inputSettings, inputDevice, driveTap, held, bindingTaps,
    frameScheduler, gamePerformance, diagnostics, liveLearning, bulkTraining, practiceLibrary, clear, editingText } = bindings;
  const events = new AbortController();
  let worldHost: Awaited<ReturnType<typeof createWorldHost>> | undefined;
  let worldStarting = false, disposed = false, gameplayAudioId = 0, previousPhysicsOverflows = 0;
  let graphicsLost = renderer.isContextLost(), idlePollMs = 0;
  let polledInput: ReturnType<typeof pollInput> | undefined, inputForFrame: ReturnType<typeof pollInput> | undefined;
  let graphicsTimeout: ReturnType<typeof setTimeout> | undefined;
  let unlockLocalModes: (() => void) | undefined;
  async function startWorld(settings: { mode: 'inline' | 'worker'; buffers: 1 | 2 | 3; checkpoint: GameplaySnapshot3D; automatic?: boolean; freshInput?: boolean; inputBeforeDraw?: boolean; pacedPolling?: boolean; wakeFrames?: boolean; lateInput?: boolean; services?: 'none' | 'review' | 'full'; diagnostic?: boolean; provenance?: boolean; traceProvenance?: boolean; oracle?: boolean; requestTimeoutMs?: number; stallTimeoutMs?: number; workerSource?: string }) {
      if(disposed)throw Error('World controller is disposed.');
      if(settings.mode==='worker'&&settings.automatic!==false&&settings.freshInput)settings={...settings,wakeFrames:settings.wakeFrames??true,lateInput:settings.lateInput??true,inputBeforeDraw:settings.inputBeforeDraw??true,pacedPolling:settings.pacedPolling??true};
      if (worldHost || worldStarting) throw Error('Reload to change world ownership.');
      bindings.requireStart();
      worldStarting = true;
      try {
      const actorId = combat?.fighters.find(f => f.control === 'player')?.entityId;
      const looks = appearance && actorId ? [resolveWorldLook({catalog: appearance.catalog, actorId, selections: appearance.state.saved.current.selections})] : [];
      const started = await createWorldHost({runtime, source: settings.workerSource ?? bindings.workerSource, mode: settings.mode, buffers: settings.buffers, automatic: settings.automatic, freshInput: settings.freshInput,inputBeforeDraw:settings.inputBeforeDraw,store:contextualStore,requestTimeoutMs:settings.requestTimeoutMs,stallTimeoutMs:settings.stallTimeoutMs,
        onFrame: settings.wakeFrames ? sampledInput => {
          if (!worldHost || disposed || document.hidden) return;
          // Reuse only within this synchronous wake. A deferred VSync callback polls again.
          inputForFrame=sampledInput?polledInput:undefined;
          try { frameScheduler.wake(); } finally { inputForFrame=undefined;polledInput=undefined; }
        } : undefined,
        sampleInput: settings.lateInput ? () => {
          if (!worldHost || bindings.capturePresentation?.manual) return true;
          if (disposed || document.hidden || !document.hasFocus() || graphicsLost || worldApi.error || worldApi.pending) return false;
          polledInput=pollInput(performance.now());return worldApi.pending === 0;
        } : undefined,
        init: {project, assets, checkpoint: settings.checkpoint, timeline, looks,
          provenance: settings.provenance ? { owner: crypto.randomUUID(), trace: settings.traceProvenance ?? false } : undefined,
          services:settings.services??'full',diagnostic:settings.diagnostic,learning:!!contextualStore,
          gameplayOptions: {combatAiPolicies:[learnedPolicy,learnedPolicy],combatAiLearning:[learnedModel,learnedModel],combatAiTuning: contextualStore ? [{opponentId:'general'},{opponentId:'general'}] : undefined},
          presentation: {poses:appearance?.poses(false),styles:appearance?.styles(false),reducedMotion:bindings.reducedMotion},
          input: {actions:[],width:canvas.clientWidth||canvas.width,height:canvas.clientHeight||canvas.height,paused:false}}});
      if(disposed){started.dispose();throw Error('World controller closed during startup.');}
      worldHost=started;idlePollMs=settings.pacedPolling?6.0606060606060606:0; // 165 Hz.
      worldAuthority.attach({
        async snapshot(){return (await worldApi.command({type:'snapshot'})).state;},
        async restore(snapshot){await worldApi.command({type:'restore',snapshot});},
        async reset(){return (await worldApi.command({type:'reset'})).state;},
        async policies({policies}){if(['running','suspended'].includes(worldHost!.stats().status))await worldApi.command({type:'policies',policies});},
        async learning({models}){if(['running','suspended'].includes(worldHost!.stats().status))await worldApi.command({type:'learning',models});},
      });
      liveLearning?.invalidate();worldStarting = false;worldApi.host = worldHost;worldApi.diagnostic=!!settings.diagnostic;worldApi.oracle=!!settings.oracle;worldApi.provenance=!!settings.provenance;worldApi.traceProvenance=!!settings.traceProvenance;
      clear();controls.acknowledgeActions();gameplayUi?.acknowledgeActions();
      bulkTraining?.available(false);
      unlockLocalModes = lockLocalWorldLaunchers(canvas.parentElement);
      if(graphicsLost||document.hidden||!document.hasFocus())await worldHost.suspend(true);
      if(graphicsLost)armGraphicsTimeout();
      if(settings.diagnostic)worldApi.gpu=createGpuTimer(canvas);
      if (settings.automatic !== false) bindings.capturePresentation = undefined;
      frameScheduler.schedule();return worldHost.stats();
      } finally { worldStarting = false;if(!disposed){bindings.rebase();frameScheduler.schedule();} }
    }
  let latest: WorldFrame['output'] | undefined;
  let commandQueue: Promise<unknown> = Promise.resolve();
  let publicHost: Awaited<ReturnType<typeof createWorldHost>> | undefined;
  let gpu: ReturnType<typeof createGpuTimer> | undefined;
  let input: string[] = [];
  const worldApi = {
    get starting() { return worldStarting; },
    get recoveringGraphics() { return graphicsLost; },
    start:startWorld,
    async tryStart(settings: Parameters<typeof startWorld>[0]) {
      try { return {started:true,stats:await worldApi.start(settings)}; }
      catch(error) { if(worldHost||disposed)throw error;bindings.capturePresentation=undefined;frameScheduler.schedule();return {started:false,fallback:'standalone',reason:String(error)}; }
    },
    async snapshot() { if(!worldHost)throw Error('Worker has not started.');await worldApi.commands;return (await worldHost.snapshot()).state; },
    mainSnapshot:bindings.mainSnapshot,
    renderOracle(nowMs:number, screenshot=false) {
      if(!worldApi.oracle||!bindings.capturePresentation?.manual)throw Error('The normal renderer oracle requires explicit manual verification.');
      bindings.renderOracle(bindings.capturePresentation.startedAt+nowMs);
      return screenshot?postProcess.source().toDataURL('image/png'):undefined;
    },
    oracle:false,
    get latest() { return latest; }, set latest(value: WorldFrame['output'] | undefined) { latest = value; },
    pending:0,
    get commands() { return commandQueue; }, set commands(value: Promise<unknown>) { commandQueue = value; },
    command(command:Parameters<NonNullable<typeof worldHost>['command']>[0]) {
      if(worldApi.pending>=32)return Promise.reject(Error('Worker command capacity exceeded'));
      worldApi.pending++;
      const result=worldApi.commands.catch(()=>{}).then(()=>worldHost!.command(command));
      const queued = result.finally(()=>worldApi.pending--);worldApi.commands=queued;return queued;
    },
    fail(error:unknown) { if(worldApi.error||['closing','disposed'].includes(worldHost?.stats().status??''))return;worldApi.error=String(error);diagnostics.push({severity:'error',code:'worker-playable',message:String(error)});void worldHost?.suspend(true).catch(()=>worldHost?.dispose()); },
    error:'',
    get host() { return publicHost; }, set host(value: Awaited<ReturnType<typeof createWorldHost>> | undefined) { publicHost = value; },
    diagnostic:false,
    provenance:false,
    traceProvenance:false,
    get gpu() { return gpu; }, set gpu(value: ReturnType<typeof createGpuTimer> | undefined) { gpu = value; },
    get input() { return input; }, set input(value: string[]) { input = value; },
    inputPolls: 0,
    draw(output: WorldFrame['output'] & {row?:Record<string,number|string>}, commands: ReturnType<typeof runtime.compile>) {
      worldApi.latest=output;
      const frame = output.frame, snapshot = output.snapshot;
      const timings:Record<string,number>={};let stage=worldApi.diagnostic?performance.now():0;
      const mark=(name:string)=>{if(worldApi.diagnostic){const end=performance.now();timings[name]=end-stage;stage=end;}};
      worldApi.gpu?.begin();
      if (worldApi.provenance && output.row) output.row.webglStartedAtMs = performance.timeOrigin + performance.now();
      hook.rendererStats = renderer.render(commands, output.matrix, {cameraPosition:frame.camera.position,...shadows?.renderOptions});
      if (worldApi.provenance && output.row) output.row.webglEndedAtMs = performance.timeOrigin + performance.now();
      worldApi.gpu?.end(output.row??timings);
      mark('drawMs');
      postProcess.render(frame.renderGraph, output.effects);
      impactOverlay?.render(frame.renderGraph.impactFrame, impactTextures);
      mark('postMs');
      fighterBars?.render({snapshot,frame,matrix:output.matrix,hidden:controls.paused,fighterNames:appearance?.fighterNames(false),emblem:uploads.emblem});
      inputView.present({camera:frame.camera});
      mark('hudMs');
      audio.enqueue(output.audio.map((event: any) => gameplayAudioCommand({event,commandId:'world:'+ ++gameplayAudioId,sceneId:runtime.declaration.activeSceneId})));
      audio.update();hook.frameCount++;
      mark('audioMs');if(output.row)Object.assign(output.row,timings,{draws:hook.rendererStats.drawCalls+hook.rendererStats.shadowDrawCalls,shadowDraws:hook.rendererStats.shadowDrawCalls});
    },
    async capture(nowMs: number, screenshot = false, layers = false, renderDiagnostics?: { repeats: number; commands: boolean; explicitMsaa?: boolean }) {
      if (renderDiagnostics && (!worldApi.oracle || !layers || !Number.isInteger(renderDiagnostics.repeats) || renderDiagnostics.repeats < 1 || renderDiagnostics.repeats > 8)) throw Error('Render diagnostics require manual oracle layers and 1–8 repeats');
      const result = await worldHost!.capture(nowMs);
      const packet = createWorldPacket({commands:runtime.compile(),scene:runtime.scene});
      const commands = packet.read({buffer:result.buffer,scene:runtime.scene});
      const poseOracle = worldApi.oracle && worldApi.provenance ? canonicalSubmittedPose({ commands, scene: runtime.scene, matrix: result.output.matrix, camera: result.output.frame.camera.position }) : undefined;
      const gl = renderDiagnostics?.commands || renderDiagnostics?.explicitMsaa ? canvas.getContext('webgl2') : undefined;
      const target = gl && renderDiagnostics?.explicitMsaa ? createDiagnosticMultisampleTarget(gl) : undefined;
      const originalRender = renderer.render;
      if (target) renderer.render = (...args) => target.render(() => Reflect.apply(originalRender, renderer, args));
      const capture = gl && renderDiagnostics?.commands ? createWebGlCommandCapture(gl) : undefined;
      const renders = [];
      try {
      capture?.begin();worldApi.draw(result.output,commands);
      const png=screenshot ? postProcess.source().toDataURL('image/png') : undefined;
      const rawPng=layers?canvas.toDataURL('image/png'):undefined;
      if (renderDiagnostics) renders.push({ index: 0, png, rawPng, commands: capture?.end() });
      // Manual verification only: redraw the identical packet to distinguish
      // raster/compositor variation from a simulation or packet discrepancy.
      if(layers)for(let repeat=0;repeat<(renderDiagnostics?.repeats??1);repeat++){
        capture?.begin();
        renderer.render(packet.read({buffer:result.buffer,scene:runtime.scene}),result.output.matrix,{cameraPosition:result.output.frame.camera.position,...shadows?.renderOptions});
        postProcess.render(result.output.frame.renderGraph,result.output.effects);
        if(renderDiagnostics)renders.push({index:repeat+1,png:postProcess.source().toDataURL('image/png'),rawPng:canvas.toDataURL('image/png'),commands:capture?.end()});
      }
      // Preserve synchronous redraw ordering. Await hashes only after all images
      // are taken; an async boundary can itself change canvas behavior.
      const completedRenders=renderDiagnostics?await Promise.all(renders.map(async render=>({...render,commands:await render.commands}))):undefined;
      return {...result,poseOracle,png,rawPng,renders:completedRenders,multisampleTarget:target?.info,
        repeatPng:completedRenders?completedRenders.at(-1)?.png:layers?postProcess.source().toDataURL('image/png'):undefined,
        repeatRawPng:completedRenders?completedRenders.at(-1)?.rawPng:layers?canvas.toDataURL('image/png'):undefined};
      } finally { renderer.render = originalRender;capture?.dispose();target?.dispose(); }
    },
  };
  function armGraphicsTimeout() {
    clearTimeout(graphicsTimeout);
    graphicsTimeout=setTimeout(()=>{if(worldHost&&!disposed&&graphicsLost)worldApi.fail('Graphics recovery timed out. Reload to restart the playable.');},15000);
  }
  const syncWorldActivity=()=>{if(worldHost){const inactive=graphicsLost||!!worldApi.error||document.hidden||!document.hasFocus();clear();gamePerformance.resetWindow();void worldApi.commands.catch(()=>{}).then(()=>worldHost!.suspend(inactive)).catch(worldApi.fail);}};
  document.addEventListener('visibilitychange',syncWorldActivity,{signal:events.signal});
  window.addEventListener('blur',syncWorldActivity,{signal:events.signal});window.addEventListener('focus',syncWorldActivity,{signal:events.signal});
  canvas.addEventListener('webglcontextlost',()=>{
    graphicsLost=true;
    worldApi.gpu?.dispose();worldApi.gpu=undefined;
    clear();controls.acknowledgeActions();gameplayUi?.acknowledgeActions();worldApi.input=[];
    audio.stopScene(runtime.declaration.activeSceneId);
    syncWorldActivity();
    armGraphicsTimeout();
  },{signal:events.signal});
  canvas.addEventListener('webglcontextrestored',()=>{
    // The renderer's earlier listener rebuilds GPU resources first. Keep the
    // worker's authoritative match and discard query handles from the old context.
    clearTimeout(graphicsTimeout);
    if(renderer.isContextLost()){if(worldHost)worldApi.fail('Graphics resources could not be restored. Reload to restart the playable.');return;}
    graphicsLost=false;
    if(worldHost&&worldApi.diagnostic)worldApi.gpu=createGpuTimer(canvas);
    bindings.rebase();syncWorldActivity();frameScheduler.schedule();
  },{signal:events.signal});
  function pollInput(now: number) {
      worldApi.inputPolls++;
      const pad=inputDevice.poll(), actions=controls.readActions();
      const uiActions=new Set(actions);
      const shown=worldApi.latest?.presentation, review=worldApi.latest?.services.review;
      const fighting=shown?.layout==='fight'&&!review?.active;
      const mode=review?.active ? review.playing?'play':'menu' : controls.paused||['menu','result','intro'].includes(shown?.layout??'')?'menu':shown?.actions?.some(action=>action.action==='practice:reset')?'practice':'play';
      const routedPad=padMenu.poll({...inputSettings.poll({...pad,visible:mode!=='play'}),mode,controller:inputDevice.controller});
      if(bindings.takePointerPause())actions.add('pause');
      if(bindings.reducedMotion)actions.add('reduced-motion');
      for(const action of worldApi.input)actions.add(action);
      for(const mapping of project.settings.input) if(acceptsPhysicalCombatAction(mapping.action,mode==='practice')&&mapping.bindings.some(binding=>held.has(binding)||bindingTaps.has(binding)||routedPad.bindings.has(binding)))actions.add(mapping.action);
      for(const action of gameplayUi?.readActions()??[]){actions.add(action);uiActions.add(action);}
      for(const action of actions)if(action.startsWith('guide:'))actions.delete(action);
      inputSettings.apply({actions,keyboard:held,gamepad:routedPad.bindings,active:!controls.paused&&!editingText()&&fighting});
      const pause=pauseInput.step({actions,paused:review?.active?!review.playing:controls.paused,handlesStart:!review?.active&&!!worldApi.latest?.handlesStart&&shown?.layout!=='countdown'});
      if(pause.toggle){if(review?.active)void worldApi.command({type:'review',action:'toggle'}).catch(worldApi.fail);else controls.togglePause();}
      controls.presentPause(review?.active?!review.playing:controls.paused);
      const reviewAction=[...actions].find(action=>action.startsWith('review:'));
      if(reviewAction){
        if(reviewAction==='review:save')practiceLibrary?.saveExchange();
        else {const action=({ 'review:open':'open','review:practice':'practice','review:watch':'watch','review:resume':'toggle','review:leave':'leave' } as const);
          const matched=Object.entries(action).find(([key])=>key===reviewAction)?.[1];if(matched)void worldApi.command({type:'review',action:matched}).catch(worldApi.fail);}
        actions.clear();clear();controls.acknowledgeActions();gameplayUi?.acknowledgeActions();bindingTaps.clear();audio.stopScene(runtime.declaration.activeSceneId);
      }
      const settingsFocused=editingText()||practiceLibrary?.focused||document.activeElement instanceof HTMLElement&&!!document.activeElement.closest('.hf-runtime-controls[open], .hf3d-control-disclosure[open]');
      const resetting=[...actions].some(action=>action.endsWith(':reset')||action.startsWith('match:'));
      for(const action of driveTap.poll({nowMs:now,keyboard:held,gamepad:routedPad.bindings,gamepadConnected:pad.axes!==undefined,active:!controls.paused&&!pause.consumed&&!resetting&&!settingsFocused&&!routedPad.navigating&&fighting}))actions.add(action);
      if(controls.paused&&[...actions].some(action=>action==='match:quit'||action.startsWith('practice:')))controls.togglePause();
      const paused=controls.paused||!!practiceLibrary?.focused;
      if(paused||pause.consumed)actions.clear();
      else if(settingsFocused)for(const action of actions)if(!uiActions.has(action))actions.delete(action);
      if(!worldApi.pending){worldHost!.input({actions:[...actions],width:canvas.clientWidth||canvas.width,height:canvas.clientHeight||canvas.height,paused,reducedMotion:bindings.reducedMotion,localDirection:paused?undefined:inputView.direction({actions,axes:routedPad.axes})});driveTap.acknowledge();bindingTaps.clear();controls.acknowledgeActions();gameplayUi?.acknowledgeActions();}
      return {pad,actions};
  }
  const frame = (now: number, renderingCaptureFrame: boolean) => {
    if(disposed)return true;
    if (worldStarting) {frameScheduler.schedule();return true;}
    if (worldHost && !renderingCaptureFrame) {
      if (bindings.capturePresentation?.manual) return true;
      if(document.hidden){frameScheduler.schedule();return true;}
      if(worldApi.error||worldHost.errors.length){gameplayUi?.render({layout:'menu',title:'Game stopped',overlay:{title:'Game stopped',body:worldApi.error||worldHost.errors[0]},actions:[]});frameScheduler.schedule();return true;}
      if(graphicsLost){gameplayUi?.render({layout:'menu',title:'Restoring graphics',overlay:{title:'Restoring graphics',body:'Your match is paused while graphics recover.'},actions:[]});frameScheduler.schedule();return true;}
      const frameStarted=performance.now(), {actions}=inputForFrame??pollInput(now);
      const result=worldHost.take();
      const renderStarted=performance.now();
      let submitted: { inputToSubmitMs: number; appliedInputToSubmitMs?: number } | undefined;
      if(result){try{result.markRenderStarted();worldApi.draw(result,result.commands);submitted=result.markSubmitted();result.row.mainMs=performance.now()-frameStarted;}finally{result.release();}}
      const renderMs=performance.now()-renderStarted;
      const current=worldApi.latest;
      if(current){
        const base=controls.paused?{layout:'menu' as const,title:'Paused',overlay:{title:'Paused',body:''},actions:[{action:'pause',label:'Resume'},{action:'match:quit',label:'Main menu'}]}:combatControlPresentation({presentation:controllerPresentation({presentation:current.presentation,connected:inputDevice.controller}),definition:combat,mappings:project.settings.input,controller:inputDevice.controller});
        if(base?.actions)base.actions=base.actions.map(action=>action.action.startsWith('guide:')?{...action,disabled:true}:action);
        gameplayUi?.render(localExchangePresentation({presentation:base,review:current.services.review}));
        practiceLibrary?.render({available:controls.paused||['menu','result','practice'].includes(current.presentation?.layout??''),practice:false});
        if(canvas.parentElement)canvas.parentElement.dataset.menuOpen=String(controls.paused);
        audio.setPersonalMusicState(personalMusicState({snapshot:current.snapshot,definition:combat,paused:controls.paused||!!current.services.review?.active&&!current.services.review.playing}));
        rewards?.render({visible:controls.paused||['menu','result'].includes(current.presentation?.layout??''),replay:!!current.services.review?.active,phase:current.snapshot.combat?.match?.phase,winner:current.snapshot.combat?.match?.winner});
      }
      if(result){
        result.row.mainMs=performance.now()-frameStarted;
        result.markMainUpdateEnded();
        if (worldApi.traceProvenance) { performance.mark('hf:host-frame', { detail: result.row });performance.clearMarks('hf:host-frame'); }
        if(gamePerformance.enabled){
          const stats=hook.rendererStats!, physics=result.physics;
          const overflows=physics.candidateOverflows+physics.contactOverflows+physics.ccdTestOverflows+physics.queryTruncations;
          gamePerformance.record({time:now,intervalMs:result.row.intervalMs,cpuMs:result.row.mainMs,simulationMs:0,presentationMs:0,renderSubmitMs:renderMs,
            workerComputeMs:result.computeMs,workerSimulationMs:result.simulationMs,workerPresentationMs:result.presentationMs,inputAgeMs:result.row.inputAgeMs,frameAgeMs:result.row.frameAgeMs,
            appliedInputAgeMs:result.row.appliedInputAgeMs,inputToSubmitMs:submitted?.inputToSubmitMs,appliedInputToSubmitMs:submitted?.appliedInputToSubmitMs,
            messageDeliveryMs:result.row.messageDeliveryMs,hostWaitMs:result.row.hostWaitMs,
            steps:result.steps,droppedMs:result.droppedMs,tick:result.snapshot.tick,phase:result.row.phase,vsync:gamePerformance.vsync,
            draws:stats.drawCalls+stats.shadowDrawCalls,shadowDraws:stats.shadowDrawCalls,outlineDraws:stats.outlineDrawCalls,triangles:stats.triangles,instances:stats.instances,
            physicsOverflows:Math.max(0,overflows-previousPhysicsOverflows),combatFrame:result.snapshot.combat?.state.frame,hitstopFrames:result.snapshot.combat?.hitstop.remaining},()=>({owner:'worker',physics,actions:[...actions].slice(0,32)}));
          previousPhysicsOverflows=overflows;
        }
      }
      frameScheduler.schedule(idlePollMs);return true;
    }
    return false;
  };
  return Object.assign(worldApi, { frame, dispose() { disposed=true;events.abort();clearTimeout(graphicsTimeout);unlockLocalModes?.();worldApi.gpu?.dispose();worldHost?.dispose(); } });
}

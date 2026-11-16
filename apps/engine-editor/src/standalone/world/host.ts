import { createRenderFramePacket3D } from '@hyperfocus/engine/experimental';
import type { createHyperfocus3DRuntime } from '@hyperfocus/engine/project/runtime-3d';
import { createWorld, resetsWorldInput, type WorldInit, type WorldInput, type WorldFrame, type WorldCommand } from './world.ts';
import type { LearningStore } from './session.ts';
import { boundClockOffset, observeTimerPrecision, type ClockExchange } from './provenance/clock.ts';
import { createRenderProvenance } from './provenance/render.ts';
import { createSubmittedPoseIdentity } from './provenance/pose.ts';
import { errorMessage } from '@hyperfocus/utilities/text';

const now = () => performance.timeOrigin + performance.now();
/** Private experiment host. Exactly one unacknowledged input message and at most three frame buffers. */
export async function createWorldHost(options: { init: WorldInit; runtime: Awaited<ReturnType<typeof createHyperfocus3DRuntime>>; source: string; mode: 'inline' | 'worker'; buffers: 1 | 2 | 3; automatic?: boolean; freshInput?: boolean; inputBeforeDraw?: boolean; store?: LearningStore; requestTimeoutMs?: number; stallTimeoutMs?: number; onFrame?(sampledInput: boolean): void; sampleInput?(): boolean }) {
  const packet = createRenderFramePacket3D({ commands: options.runtime.compile(), scene: options.runtime.scene });
  const hostPoseIdentity = options.init.provenance ? createSubmittedPoseIdentity({ commands: options.runtime.compile(), scene: options.runtime.scene }) : undefined;
  const rows: Record<string, number | string>[] = [], acks: Record<string, number>[] = [], errors: string[] = [];
  const provenanceRows: Array<NonNullable<WorldFrame['output']['provenance']> & { frame: number }> = [];
  const clock: { hostTimeOriginMs: number; workerTimeOriginMs?: number;
    hostPrecision?: ReturnType<typeof observeTimerPrecision>; workerPrecision?: ReturnType<typeof observeTimerPrecision>;
    samples: ClockExchange[]; bounds?: ReturnType<typeof boundClockOffset> } = {
    hostTimeOriginMs: performance.timeOrigin, workerTimeOriginMs: undefined,
    hostPrecision: options.init.provenance ? observeTimerPrecision(() => performance.now()) : undefined,
    workerPrecision: undefined, samples: [], bounds: undefined };
  const clockChecks: Array<{ phase: string; atMs: number; samples: ClockExchange[]; bounds: ReturnType<typeof boundClockOffset>; combinedBounds: ReturnType<typeof boundClockOffset> }> = [];
  const pending = new Map<number, (value: any) => void>();
  let pendingAudio: WorldFrame['output']['audio'] = [];
  let id = 0, ready: (value: any) => void = () => {}, worker: Worker | undefined, local: Awaited<ReturnType<typeof createWorld>> | undefined;
  let latest: (WorldFrame & { frame: number; readyAt: number; receivedAt: number; timing?: { producerSendAtMs: number; inputWaitMs: number; bufferWaitMs: number; freeBuffersAfterPublish: number } }) | undefined, busy: { sequence: number; sampledAtMs: number; input: WorldInput; events: string[] } | undefined;
  let sequence = 0, disposed = false, submitted = 0, superseded = 0, acquired = 0, inputPostMs = 0, lastRendered = 0;
  let latestInput = options.init.input, latestInputAtMs = 0, held: string[] = [], queued: string[] = [];
  let started = 0, captureClock = 0;
  let sampling = false, transitioning = false, inputRequested = false, revision = 0, storageRequests = 0, suspended = false;
  let boundaryDone = Promise.resolve(), finishBoundary = () => {};
  let suspension = Promise.resolve();
  const requestTimeoutMs = options.requestTimeoutMs ?? 30000;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) throw Error('Invalid world request timeout');
  const stallTimeoutMs = options.stallTimeoutMs ?? 5000;
  if (!Number.isFinite(stallTimeoutMs) || stallTimeoutMs <= 0) throw Error('Invalid world stall timeout');
  let progressAt = performance.now(), probing = false, suspectFrame: number | undefined, watchdog: ReturnType<typeof setInterval> | undefined;
  let closing: Promise<void> | undefined;
  const buffers = Array.from({ length: options.buffers }, () => new ArrayBuffer(packet.byteLength));
  function fail(cause: unknown) {
    if (disposed || errors.length) return;
    const message = errorMessage(cause, { fallback: 'World worker failed without an error message. Check worker-src and runtime diagnostics.', nonBlank: true });
    errors.push(message);clearInterval(watchdog);ready({type:'error',error:message,message});worker?.terminate();
    for (const complete of pending.values()) complete({error:message});pending.clear();
  }
  function request(message: Record<string, unknown>, transfer: Transferable[] = [], timeoutMs = requestTimeoutMs) {
    if (disposed || errors.length) return Promise.reject(Error('World host is stopped'));
    if (pending.size >= 32) return Promise.reject(Error('World request capacity exceeded'));
    const requestId = ++id;
    return new Promise<any>((resolve, reject) => {
      // A timed-out mutation may already have run. Retiring this owner prevents
      // a late acknowledgement from silently reviving ambiguous authority.
      const timeout = setTimeout(() => {
        if (message.type === 'probe' && (closing || suspended)) { pending.get(requestId)?.({ automatic: false });pending.delete(requestId);return; }
        fail(message.type === 'probe' ? 'World stream stopped responding' : 'World request timed out');
      }, timeoutMs);
      pending.set(requestId, value => { clearTimeout(timeout);value.error ? reject(Error(value.error)) : resolve(value); });
      try { worker!.postMessage({...message,id:requestId},transfer); }
      catch (error) { clearTimeout(timeout);pending.delete(requestId);reject(error); }
    });
  }
  const release = (buffer: ArrayBuffer) => { if (!disposed && !closing && !errors.length && worker) worker.postMessage({ type: 'release', epoch: 1, buffer }, [buffer]); };
  async function calibrateClock(phase: 'startup' | 'end') {
    if (!options.init.provenance || !worker) return undefined;
    if (clockChecks.length >= 16) throw Error('Clock check capacity exceeded');
    const samples: ClockExchange[] = [];
    for (let sample = 0; sample < 9; sample++) {
      const hostSend = now(), reply = await request({ type: 'clock' }), hostReceive = now();
      clock.workerTimeOriginMs = reply.timeOrigin;clock.workerPrecision = reply.precision;
      samples.push({ hostSend, hostReceive, workerReceive: reply.workerReceive, workerSend: reply.workerSend });
    }
    const bounds = boundClockOffset(samples, .25), combinedBounds = boundClockOffset([...clock.samples, ...samples], .25);
    if (phase === 'startup') { clock.samples = samples;clock.bounds = bounds; }
    const check = { phase, atMs: now(), samples, bounds, combinedBounds };clockChecks.push(check);return check;
  }
  if (options.mode === 'worker') {
    const url = URL.createObjectURL(new Blob([options.source], { type: 'text/javascript' }));
    try { worker = new Worker(url); } finally { URL.revokeObjectURL(url); }
    worker.onerror = event => fail(event.message);
    worker.onmessageerror = () => fail('World message could not be decoded');
    worker.onmessage = ({ data }) => {
      if (disposed || errors.length) return;
      if (data.type === 'error') fail(data.message);
      else if (data.type === 'ready') ready(data);
      else if (data.type === 'frame') {
        data.receivedAt = now();
        progressAt = performance.now();suspectFrame = undefined;
        if (data.output.revision < revision) { release(data.buffer);return; }
        submitted++;pendingAudio.push(...data.output.audio);
        if (pendingAudio.length > 256) { fail('Audio event capacity exceeded');return; }
        if (latest) { superseded++;release(latest.buffer); }latest = data;
        let sampledInput = false;
        if (data.needsInput) { if (busy || transitioning || closing || suspended) inputRequested = true;else sampledInput = !!submitInput() && !!options.sampleInput; }
        try { options.onFrame?.(sampledInput); } catch (error) { fail(String(error)); }
      }
      else if (data.type === 'ack') {
        if (!busy || busy.sequence !== data.sequence) { fail('Unexpected input acknowledgement');return; }
        if (!data.accepted) { fail('Input mailbox overflow');return; }
        const acknowledgedAtMs = now();
        acks.push({ sequence: data.sequence, transportAckMs: acknowledgedAtMs - busy.sampledAtMs - started, receiveMs: data.receivedAt - busy.sampledAtMs - started,
          ...(options.init.provenance ? { inputSampledAtMs: busy.sampledAtMs + started, inputSentAtMs: data.inputSendAtMs, inputReceivedAtMs: data.receivedAt, acknowledgedAtMs } : {}) });
        if (acks.length > 5000) acks.shift();busy = undefined;
        if (inputRequested && !transitioning && !closing && !suspended) submitInput();
      } else if (data.type === 'need-input') { if (busy || transitioning || closing || suspended) inputRequested = true;else submitInput(); }
      else if (data.type === 'storage') {
        const complete = (value?: unknown, error?: string) => { if (!disposed) worker?.postMessage({ type: 'storage-result', id: data.id, value, error }); };
        if (!options.store || !['load', 'save'].includes(data.method) || storageRequests >= 8) { complete(undefined, 'Storage service unavailable or at capacity');return; }
        storageRequests++;
        void Promise.resolve().then(() => data.method === 'load' ? options.store!.load() : options.store!.save(data.value))
          .then(value => complete(value), error => complete(undefined, String(error))).finally(() => storageRequests--);
      }
      else { pending.get(data.id)?.(data);pending.delete(data.id); }
    };
    let startupTimeout: ReturnType<typeof setTimeout>;
    const initialized = new Promise<any>(resolve => { ready = resolve;startupTimeout = setTimeout(() => fail('World initialization timed out'), requestTimeoutMs); });
    try { worker.postMessage({ type: 'init', init: options.init }); } catch (error) { fail(String(error)); }
    const result = await initialized;clearTimeout(startupTimeout!);if (result.error || result.type === 'error') { worker.terminate();throw Error(result.error ?? result.message); }
    if (result.bytes !== packet.byteLength) { worker.terminate();throw Error(`World packet registry mismatch: host ${packet.byteLength} bytes, worker ${result.bytes} bytes`); }
    if (options.init.provenance) {
      await calibrateClock('startup');
      if (!clock.bounds!.consistent || !clock.bounds!.epochAligned) { worker.terminate();throw Error('Cross-realm epoch clock calibration failed'); }
    }
  } else local = await createWorld(options.init, options.store);
  // Initialization is excluded from the world clock; all sample times share this origin across realms.
  started = now();
  if (worker) worker.postMessage({ type: 'start', epoch: 1, start: started, buffers, automatic: options.automatic !== false, freshInput: options.freshInput, inputBeforeDraw: options.inputBeforeDraw }, buffers);
  if (worker && options.automatic !== false) {
    progressAt = performance.now();
    watchdog = setInterval(() => {
      if (disposed || closing || errors.length || suspended || transitioning || probing || pending.size || performance.now() - progressAt < stallTimeoutMs) return;
      probing = true;
      // Ask after the quiet interval, rather than declaring failure from a late
      // host timer. A blocked main thread may have fresh worker messages queued.
      void request({ type: 'probe' }, [], stallTimeoutMs).then(status => {
        if (disposed || closing || suspended || transitioning || performance.now() - progressAt < stallTimeoutMs) return;
        // All buffers can legitimately belong to the host. A heartbeat is not
        // a produced frame and must never inflate submission/FPS counters.
        if (status.automatic && !status.suspended && status.freeBuffers > 0) {
          if (suspectFrame === status.frame) fail('World stream stalled with available frame buffers');
          else suspectFrame = status.frame;
        } else suspectFrame = undefined;
        progressAt = performance.now();
      }, error => { if (!closing && !disposed) fail(String(error)); }).finally(() => { probing = false; });
    }, Math.max(50, Math.min(1000, stallTimeoutMs / 2)));
  }
  function submitInput() {
    if (busy) throw Error('More than one input request is outstanding');
    inputRequested = true;
    if (options.freshInput && options.automatic !== false && options.sampleInput) {
      sampling = true;
      try { if (!options.sampleInput()) return; } catch (error) { fail(String(error));return; } finally { sampling = false; }
    }
    if (disposed || closing || errors.length || transitioning || suspended) return;
    inputRequested = false;
    const update = { sequence: ++sequence, sampledAtMs: latestInputAtMs, input: latestInput, events: queued, ...(options.init.provenance ? { sentAtMs: now() } : {}) };queued = [];
    if (worker) { busy = update;const before = performance.now();worker.postMessage({ type: options.freshInput && options.automatic !== false ? 'requested-input' : 'input', update });inputPostMs += performance.now() - before; }
    else if (!local!.update(update)) throw Error('Local input mailbox rejected an update');
    return true;
  }
  return {
    rows, acks, errors, provenanceRows, calibrateClock,
    input(input: WorldInput) {
      if (disposed || closing || errors.length || suspended) return;
      if (transitioning) { latestInput = input;latestInputAtMs = now() - started;return; }
      for (const action of input.actions) if (!held.includes(action)) queued.push(action);
      held = input.actions;
      latestInput = input;latestInputAtMs = now() - started;
      if (queued.length > 64) { fail('Host input event capacity exceeded');return; }
      if (!busy && (!options.freshInput || options.automatic === false || inputRequested && !sampling)) submitInput();
    },
    take() {
      if (disposed || closing || errors.length || transitioning || suspended) return;
      const takenAt = now();
      const result = local ? { ...local.render(buffers[0]!, takenAt - started), frame: ++submitted, readyAt: now(), receivedAt: now(), timing: undefined } : latest;
      if (!result) return;
      if (worker) { result.output.audio = pendingAudio;pendingAudio = []; }
      latest = undefined;acquired++;
      const before = performance.now(), commands = packet.read({ buffer: result.buffer, scene: options.runtime.scene });
      const row = { mainMs: 0, frame: result.frame, tick: result.output.snapshot.tick, phase: result.output.paused ? 'paused' : result.output.services.review?.active ? 'review' : result.output.snapshot.combat?.match?.phase ?? '',
        intervalMs: lastRendered ? takenAt - lastRendered : 0, frameAgeMs: now() - started - result.output.sampledWorldAtMs,
        inputAgeMs: now() - started - result.output.sampledAtMs,
        ...(result.output.appliedSampledAtMs === undefined ? {} : { appliedInputAgeMs: now() - started - result.output.appliedSampledAtMs }), inputSequence: result.output.sequence, appliedSequence: result.output.appliedSequence,
        computeMs: result.output.computeMs, simulationMs: result.output.simulationMs, presentationMs: result.output.presentationMs, compileMs: result.output.compileMs,
        packetReadMs: performance.now() - before, deliveryMs: worker ? takenAt - result.readyAt : 0, inputPostMs,
        messageDeliveryMs: worker ? result.receivedAt - result.readyAt : 0, hostWaitMs: worker ? takenAt - result.receivedAt : 0,
        steps: result.output.steps, droppedMs: result.output.droppedMs, ...result.output.detailed,
        coreMsTotal: result.output.services.coreMs, hookMsTotal: result.output.services.hookMs,
        ticksTotal: result.output.services.ticks,
        recordedFrames: result.output.services.review?.retainedFrames ?? 0, recordedBytes: result.output.services.review?.retainedBytes ?? 0 };
      if (result.output.provenance) {
        const source = result.output.provenance;
        const identityStart = performance.now(), pose = hostPoseIdentity!.observe({ commands, matrix: result.output.matrix, camera: result.output.frame.camera.position, epoch: source.discontinuity });
        const hostIdentityMs = performance.now() - identityStart;
        provenanceRows.push({ ...source, frame: result.frame });if (provenanceRows.length > 5000) provenanceRows.shift();
        Object.assign(row, { measurementSchema: 2, submissionId: acquired, packetVersion: source.requestId, packetIdentityKind: 'publication-sequence', requestId: source.requestId, owner: source.owner, discontinuity: source.discontinuity, stateCommit: source.stateCommit,
          producerStartAtMs: source.producerStartAtMs, producerPublishAtMs: source.producerPublishAtMs, totalProducerWallMs: source.totalProducerWallMs,
          preparationStartAtMs: source.preparationStartAtMs, preparationEndAtMs: source.preparationEndAtMs,
          identityMs: source.identityMs, hostIdentityMs, producerPoseVersion: source.pose?.version ?? 0,
          ...(source.stateProducedAtMs === undefined ? {} : { stateProducedAtMs: source.stateProducedAtMs }),
          ...(pose ? { poseVersion: pose.version, poseComparable: Number(pose.comparable), ...(pose.changed === undefined ? {} : { submittedPoseChanged: Number(pose.changed) }),
            changedPoseInstances: pose.changedInstances, changedPoseSkeletons: pose.changedSkeletons, changedPoseMorphs: pose.changedMorphs, cameraPoseChanged: Number(pose.cameraChanged) } : {}),
          producerReceivedAtMs: result.receivedAt, packetTakenAtMs: takenAt, ...result.timing });
      }
      inputPostMs = 0;lastRendered = takenAt;rows.push(row);if (rows.length > 5000) rows.shift();
      let returned = false;
      const render = createRenderProvenance({ now, row, sampledAtMs: started + result.output.sampledAtMs,
        appliedAtMs: result.output.appliedSampledAtMs === undefined ? undefined : started + result.output.appliedSampledAtMs });
      return { ...result.output, commands, row, markRenderStarted: render.begin, markSubmitted: render.submitted, markMainUpdateEnded: render.finish,
        release() { if (returned) return;returned = true;if (options.init.provenance) Object.assign(row, { packetReleasedAtMs: now() });release(result.buffer); } };
    },
    async capture(nowMs: number) {
      if (disposed || closing || errors.length) throw Error('World host is stopped');
      if (options.automatic !== false) throw Error('Capture requires manual mode');
      const buffer = local ? buffers[0]! : new ArrayBuffer(packet.byteLength);
      const result = local ? { ...local.render(buffer, nowMs), state: local.snapshot() } : await request({ type: 'capture', nowMs, buffer }, [buffer]);
      captureClock = nowMs;return result;
    },
    async snapshot() {
      if (disposed || closing || errors.length) throw Error('World host is stopped');
      if (local) return { state: local.snapshot(), mailbox: local.mailbox(), services: local.services() };
      return request({ type: 'snapshot' });
    },
    async command(command: WorldCommand, nowMs?: number) {
      if (disposed || closing || errors.length) throw Error('World host is stopped');
      if (transitioning) throw Error('A world command is already outstanding');
      const commandClock = nowMs ?? (options.automatic === false ? captureClock : now() - started);
      if (!Number.isFinite(commandClock)) throw Error('Commands require a finite clock');
      transitioning = true;
      boundaryDone = new Promise(resolve => { finishBoundary = resolve; });
      try {
        const result = local ? local.command(command, commandClock) : await request({ type: 'command', command, nowMs: commandClock });
        if (resetsWorldInput(command)) {
          suspended = result.suspended;
          progressAt = performance.now();suspectFrame = undefined;
          if (suspended) inputRequested = false;
          revision = result.revision;queued = [];held = [];latestInput = { ...latestInput, actions: [], localDirection: undefined };
          if (latest && latest.output.revision < revision) { release(latest.buffer);latest = undefined; }
          pendingAudio = [];lastRendered = 0;
        }
        return result;
      } finally { transitioning = false;finishBoundary();if (inputRequested && !suspended && !disposed && !closing && !errors.length && !busy) { inputRequested = false;submitInput(); } }
    },
    suspend(value: boolean) {
      // Visibility can change while a save/restore boundary is in flight. Retain
      // event order and wait for that boundary without competing for authority.
      suspension = suspension.catch(() => {}).then(async () => {
        await boundaryDone;
        if (value !== suspended) await this.command({ type: 'suspend', suspended: value });
      });
      return suspension;
    },
    async flush() { if (local) await local.flush();else await request({ type: 'flush' }); },
    close() {
      if (closing) return closing;
      if (disposed) return Promise.resolve();
      closing = (async () => {
        clearInterval(watchdog);
        try { if (local) await local.dispose();else await request({ type: 'stop' }); }
        finally { this.dispose(); }
      })();
      return closing;
    },
    stats() { return { measurementSchema: 2, provenance: !!options.init.provenance, clock: options.init.provenance ? clock : undefined, provenanceRows, mode: options.mode, status: disposed ? 'disposed' : errors.length ? 'failed' : closing ? 'closing' : suspended ? 'suspended' : 'running', freshInput: options.freshInput ?? false, buffers: options.buffers, packetBytes: packet.byteLength, retainedPacketBytes: packet.byteLength * options.buffers, submitted, acquired, superseded, sequence, pendingRequests: pending.size, pendingInputMessages: Number(!!busy), inputBytes: new TextEncoder().encode(JSON.stringify({input:latestInput,events:queued})).byteLength, rows, acks, errors }; },
    dispose() { if (disposed) return;disposed = true;clearInterval(watchdog);hostPoseIdentity?.dispose();worker?.terminate();void local?.dispose().catch(error => errors.push(String(error)));local=undefined;latest = undefined;pendingAudio=[];busy=undefined;queued=[];for(const complete of pending.values())complete({error:'World host disposed'});pending.clear(); },
  };
}

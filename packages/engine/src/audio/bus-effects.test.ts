import { expect, test } from 'bun:test';
import { createAudioEngine } from './index.ts';
import { effectFixture } from './bus-effects-fixture.ts';

test('creating a bus before unlock preserves the output protection and standard buses', async () => {
  const f = effectFixture(), engine = createAudioEngine({ context: f.context });
  const custom = engine.createBus('world', .4);
  expect(f.compressors).toHaveLength(1);expect(f.gains[0]!.connections).toEqual([f.compressors[0]]);
  expect(custom.gain).toBe(.4);await engine.unlock();expect(engine.withBus('music', (_context, destination) => !!destination)).toBe(true);
  await engine.dispose();
});

test('bus inserts route decoded and custom sources through compression, ceiling, filter and pitch without rate changes', async () => {
  const f = effectFixture(), engine = createAudioEngine({ context: f.context, outputLimiter: false });await engine.unlock();
  engine.configureBusEffects({ bus: 'music', compressor: { threshold: -18, ratio: 4, ceilingDb: -9 }, highpassHz: 30, pitchCents: 0 });
  const input = engine.withBus('music', (_context, destination) => destination);
  engine.cacheBuffer('song', f.context.createBuffer(1, 48000, 48000));const song = engine.playBuffer('song', { bus: 'music' });
  expect(song.ok).toBe(true);expect(f.gains.some(gain => gain.connections.includes(input))).toBe(true);
  engine.setBusReactive({ bus: 'music', highpassHz: 250, pitchCents: -35, fadeSeconds: .4 });
  expect(f.filters[0]!.frequency.value).toBe(250);expect(f.sources.filter(source => !source.loop).every(source => source.playbackRate.value === 1)).toBe(true);
  expect(Math.max(...f.shapers[0]!.curve!)).toBeCloseTo(0.350751873952568, 6);
  expect(engine.busEffectsSnapshot()[0]).toMatchObject({ compressor: true, ceiling: true, highpass: true, pitch: true, effects: { pitchCents: -35 } });
  const controls = f.sources.filter(source => source.loop);expect(controls).toHaveLength(4);expect(controls.map(source => source.offset)).toEqual([0, 0, .05, .05]);
  const controlRate = Math.abs(0.02001380364262062) * 2;
  expect(controls.every(source => Math.abs(source.playbackRate.value - controlRate) < 1e-12)).toBe(true);
  engine.setBusReactive({ bus: 'music', pitchCents: 0, fadeSeconds: .2 });expect(controls.every(source => source.playbackRate.value === 0)).toBe(true);
  engine.setBusReactive({ bus: 'music', pitchCents: -35, fadeSeconds: .2 });expect(controls.every(source => Math.abs(source.playbackRate.value - controlRate) < 1e-12)).toBe(true);
  const envelope = f.buffers[1]!.getChannelData(0);
  for (let i = 0; i < envelope.length / 2; i += 73) expect(envelope[i]! + envelope[i + envelope.length / 2]!).toBeCloseTo(1, 6);
  await engine.dispose();expect(controls.every(source => source.stops === 1)).toBe(true);expect(f.delays.every(delay => delay.disconnectCount() === 1)).toBe(true);
});

test('convolution sends and tails finish before the user fader and mute, with recovery/disposal ownership', async () => {
  const f = effectFixture(), engine = createAudioEngine({ context: f.context, outputLimiter: false });await engine.unlock();
  const bus = engine.createBus('sfx');engine.cacheBuffer('city', f.context.createBuffer(1, 24000, 48000));
  engine.configureBusEffects({ bus: 'sfx', reverb: { assetId: 'city', sendGain: .0631 } });
  expect(f.convolvers[0]!.normalize).toBe(false);expect(f.convolvers[0]!.connections).toEqual([bus.node]);
  engine.muteBus('sfx');expect(bus.node.gain.value).toBe(0);
  engine.removeBuffer('city');
  await engine.recover();expect(f.convolvers[0]!.disconnectCount()).toBe(1);expect(engine.busEffectsSnapshot()[0]).toMatchObject({ reverb: true, muted: true });
  await engine.dispose();expect(f.convolvers[1]!.disconnectCount()).toBe(1);
});

test('stamina-only updates do not repeatedly restart an unchanged pitch target', async () => {
  const f = effectFixture(), engine = createAudioEngine({ context: f.context, outputLimiter: false });await engine.unlock();
  engine.configureBusEffects({ bus: 'music', lowpassHz: 20000, pitchCents: 0 });
  engine.setBusReactive({ bus: 'music', pitchCents: -35, fadeSeconds: .25 });
  const controls = f.sources.filter(source => source.loop), scheduled = controls.map(source => source.playbackRate.events.length);
  for (let frame = 0; frame < 60; frame++) { f.context.currentTime += .016666666666666666;engine.setBusReactive({ bus: 'music', lowpassHz: 20000 - frame, pitchCents: -35, fadeSeconds: 0 }); }
  expect(controls.map(source => source.playbackRate.events.length)).toEqual(scheduled);
  expect(f.filters[0]!.frequency.value).toBe(19941);
  engine.setBusReactive({ bus: 'music', pitchCents: 0, fadeSeconds: .8 });
  expect(controls.every((source, index) => source.playbackRate.events.length > scheduled[index]! && source.playbackRate.value === 0)).toBe(true);
  await engine.dispose();
});

test('zero-fade reactive filters replace pending automation immediately with native hold and fallback contexts', async () => {
  for (const nativeHold of [false, true]) {
    const f = effectFixture(), engine = createAudioEngine({ context: f.context, outputLimiter: false });await engine.unlock();
    engine.configureBusEffects({ bus: 'music', highpassHz: 30, lowpassHz: 20000 });
    for (const filter of f.filters) {
      const parameter = filter.frequency;
      if (nativeHold) Object.assign(parameter, { cancelAndHoldAtTime(time: number) { parameter.events.push({ kind: 'hold', value: parameter.value, time }); } });
    }
    engine.setBusReactive({ bus: 'music', highpassHz: 120, lowpassHz: 4000, fadeSeconds: 1 });
    expect(f.filters.map(filter => filter.frequency.events.at(-1)?.kind)).toEqual(['ramp', 'ramp']);
    f.context.currentTime = 10.1;const before = f.filters.map(filter => filter.frequency.events.length);
    engine.setBusReactive({ bus: 'music', highpassHz: 240, lowpassHz: 800, fadeSeconds: 0 });
    for (const [index, filter] of f.filters.entries()) {
      const immediate = filter.frequency.events.slice(before[index]);
      expect(immediate[0]!.kind).toBe(nativeHold ? 'hold' : 'cancel');
      expect(immediate.every(event => event.time === 10.1 && event.kind !== 'ramp')).toBe(true);
      expect(immediate.at(-1)).toEqual({ kind: 'set', value: index === 0 ? 240 : 800, time: 10.1 });
    }
    expect(engine.busEffectsSnapshot()[0]!.effects).toMatchObject({ highpassHz: 240, lowpassHz: 800 });
    await engine.dispose();
  }
});

test('low-pass routing preserves decoded and custom sources, independent high-pass intent and recovery ownership', async () => {
  const old = effectFixture(), fresh = effectFixture(), engine = createAudioEngine({ context: old.context, contextFactory: () => fresh.context, outputLimiter: false });await engine.unlock();
  engine.configureBusEffects({ bus: 'music', highpassHz: 30, lowpassHz: 20000 });
  const input = engine.withBus('music', (_context, destination) => destination), custom = old.context.createGain();custom.connect(input);
  const bus = engine.createBus('music');
  expect(old.filters.map(filter => [filter.type, filter.frequency.value, filter.Q.value])).toEqual([['highpass', 30, .707], ['lowpass', 20000, .707]]);
  expect(old.filters[0]!.connections).toEqual([old.filters[1]]);expect(old.filters[1]!.connections).toEqual([bus.node]);
  engine.cacheBuffer('song', old.context.createBuffer(1, 48000, 48000));expect(engine.playBuffer('song', { bus: 'music' }).ok).toBe(true);
  expect(old.gains.filter(gain => gain.connections.includes(input))).toHaveLength(2);
  engine.setBusReactive({ bus: 'music', lowpassHz: 800, fadeSeconds: 0 });
  expect(old.filters[0]!.frequency.value).toBe(30);expect(engine.busEffectsSnapshot()[0]).toMatchObject({ highpass: true, lowpass: true, ownedNodes: 3, effects: { lowpassHz: 800 } });
  old.setState('closed');await engine.recover();
  expect(old.filters.every(filter => filter.disconnectCount() === 1)).toBe(true);
  expect(fresh.filters.filter(filter => filter.disconnectCount() === 0).map(filter => [filter.type, filter.frequency.value])).toEqual([['highpass', 30], ['lowpass', 800]]);
  engine.configureBusEffects({ bus: 'music', lowpassHz: 1600 });
  expect(fresh.filters.slice(0, -1).every(filter => filter.disconnectCount() === 1)).toBe(true);
  expect(engine.busEffectsSnapshot()[0]).toMatchObject({ highpass: false, lowpass: true, ownedNodes: 2 });
  await engine.dispose();expect(fresh.filters.every(filter => filter.disconnectCount() === 1)).toBe(true);
});

test('closed-context recovery preserves bus intent and lets host rehydrate the IR against the new graph', async () => {
  const old = effectFixture(), fresh = effectFixture();let engine: ReturnType<typeof createAudioEngine>;
  engine = createAudioEngine({ context: old.context, contextFactory: () => fresh.context, outputLimiter: false, onRecoveryRequired: async () => {
    await engine.decode('city', new Uint8Array([1]));engine.configureBusEffects({ bus: 'sfx', reverb: { assetId: 'city' } });
  } });
  await engine.unlock();engine.cacheBuffer('city', old.context.createBuffer(1, 24000, 48000));engine.configureBusEffects({ bus: 'sfx', reverb: { assetId: 'city' } });engine.setBusGain('sfx', .5);
  old.setState('closed');await engine.recover();
  expect(engine.context()).toBe(fresh.context);expect(engine.busEffectsSnapshot()[0]).toMatchObject({ gain: .5, reverb: true });
  expect(old.convolvers[0]!.disconnectCount()).toBe(1);await engine.dispose();expect(fresh.convolvers.every(node => node.disconnectCount() > 0)).toBe(true);
});

test('invalid parameters are rejected before graph changes; absent native nodes preserve dry playback visibly', async () => {
  const f = effectFixture(), context = { currentTime: 0, state: 'running', destination: f.context.destination, createGain: f.context.createGain, createBufferSource: f.context.createBufferSource, resume: f.context.resume, decodeAudioData: f.context.decodeAudioData };
  const engine = createAudioEngine({ context, outputLimiter: false });await engine.unlock();
  expect(() => engine.configureBusEffects({ bus: 'music', pitchCents: 101 })).toThrow();expect(() => engine.configureBusEffects({ bus: 'music', compressor: { ratio: 21 } })).toThrow();
  expect(() => engine.setBusReactive({ bus: 'music', highpassHz: NaN })).toThrow();expect(engine.busEffectsSnapshot()).toEqual([]);
  for (const lowpassHz of [NaN, Infinity, 9, 20001]) { expect(() => engine.configureBusEffects({ bus: 'music', lowpassHz })).toThrow();expect(() => engine.setBusReactive({ bus: 'music', lowpassHz })).toThrow(); }
  engine.configureBusEffects({ bus: 'music', compressor: { ceilingDb: -9 }, highpassHz: 30, lowpassHz: 20000, pitchCents: -35, reverb: { assetId: 'missing' } });
  expect(engine.busEffectsSnapshot()[0]).toMatchObject({ compressor: false, ceiling: false, highpass: false, lowpass: false, pitch: false, reverb: false });
  expect(engine.diagnostics().filter(item => item.code === 'effects-unavailable')).toHaveLength(6);
  engine.cacheBuffer('song', f.context.createBuffer(1, 24000, 48000));expect(engine.playBuffer('song', { bus: 'music' }).ok).toBe(true);await engine.dispose();
});

test('important-voice saturation is bounded and cleans up when capacity steals a voice', async () => {
  const f = effectFixture(), engine = createAudioEngine({ context: f.context, outputLimiter: false, maxVoices: 1 });await engine.unlock();engine.cacheBuffer('hit', f.context.createBuffer(1, 24000, 48000));
  expect(engine.playBuffer('hit', { saturation: 1 }).ok).toBe(true);
  const curve = f.shapers[0]!.curve!;expect(curve[2048]).toBe(0);expect(Math.max(...curve)).toBeLessThan(1);expect(curve[2560]).toBeCloseTo(-curve[1536]!, 6);
  expect(engine.playBuffer('hit', { saturation: 0 }).ok).toBe(true);expect(f.shapers[0]!.disconnectCount()).toBe(1);expect(f.shapers).toHaveLength(1);
  expect(engine.playBuffer('hit', { saturation: 2 })).toMatchObject({ ok: false, code: 'play-failed' });await engine.dispose();
});

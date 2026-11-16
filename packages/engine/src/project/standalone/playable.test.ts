import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { createDefaultProject } from '../editor.ts';
import { createCombatProject3D } from '../3d/combat-declaration.ts';
import { createStandalonePlayableHtml, readStandaloneStreamedAudio, supportsStandaloneCombatConnections } from '../standalone-playable.ts';
import { isRecord } from '@hyperfocus/utilities/records';

const files = { projectJson: new Uint8Array(), assetsArchive: new Uint8Array(), runtimeSource: 'globalThis.booted=true;' };

test('offline base64 preserves padding, chunk boundaries and byte-view ranges with native or bounded fallback encoding', () => {
  const project = createDefaultProject('Base64 parity'), descriptor = Object.getOwnPropertyDescriptor(Uint8Array.prototype, 'toBase64');
  try {
    for (const fallback of [false, true]) {
      if (fallback) Object.defineProperty(Uint8Array.prototype, 'toBase64', { value: undefined, configurable: true });
      for (const length of [0, 1, 2, 3, 255, 256, 12287, 12288, 12289, 65537]) {
        const storage = Uint8Array.from({ length: length + 17 }, (_, index) => index * 73 % 256), bytes = storage.subarray(7, 7 + length);
        const html = createStandalonePlayableHtml({ project, ...files, projectJson: bytes, assetsArchive: bytes });
        const payload = JSON.parse(/id="hyperfocus-project-pair">([^<]+)<\/script>/.exec(html)![1]!);
        const expected = Buffer.from(bytes).toString('base64');
        expect(payload.projectJson).toBe(expected);expect(payload.assetsArchive).toBe(expected);
        expect(new Uint8Array(Buffer.from(payload.assetsArchive, 'base64'))).toEqual(bytes);
      }
    }
  } finally {
    if (descriptor) Object.defineProperty(Uint8Array.prototype, 'toBase64', descriptor);else Reflect.deleteProperty(Uint8Array.prototype, 'toBase64');
  }
});

test('streamed delivery permits only distinct same-origin MP3 descriptors matching the catalog', () => {
  const project = createDefaultProject();
  project.assets.push({ id: 'song', name: 'Song', kind: 'audio', source: 'generated', mimeType: 'audio/mpeg', size: 100, lastModified: 0 });
  const source = { assetId: 'song', sha256: 'a'.repeat(64), url: `audio/${'a'.repeat(64)}.mp3`, size: 100, durationSeconds: 60 };
  expect(readStandaloneStreamedAudio({ project, value: [source] })).toEqual([source]);
  const html = createStandalonePlayableHtml({ project, ...files, streamedAudio: [source] });
  expect(html).toContain("media-src data: blob: 'self'");
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain('"streamedAudio":[{"assetId":"song"');
  expect(createStandalonePlayableHtml({ project, ...files })).not.toContain('"streamedAudio"');
  for (const change of [{ url: 'https://example.com/music.mp3' }, { url: '../music.mp3' }, { assetId: 'unknown' }, { size: 99 }, { size: Infinity }, { durationSeconds: NaN }, { durationSeconds: 3601 }, { sha256: 'bad' }]) {
    expect(() => readStandaloneStreamedAudio({ project, value: [{ ...source, ...change }] })).toThrow();
  }
  expect(() => readStandaloneStreamedAudio({ project, value: [source, source] })).toThrow();
  for (const originalCatalog of [null, {}, { source: 'remote' }, { source: 'imported', sha256: 'b'.repeat(64) }]) {
    expect(() => readStandaloneStreamedAudio({ project, value: [{ ...source, originalCatalog }] })).toThrow();
  }
  const originalCatalog = { source: 'imported', sha256: source.sha256 } as const;
  expect(readStandaloneStreamedAudio({ project, value: [{ ...source, originalCatalog }] })[0]?.originalCatalog).toEqual(originalCatalog);
  expect(createStandalonePlayableHtml({ project, ...files, streamedAudio: [{ ...source, originalCatalog }] })).toContain('"originalCatalog":{"source":"imported","sha256":');
  const song = project.assets.find(asset => asset.id === 'song');if (!song) throw new Error('Missing test song.');
  song.audioMetadata = { bpm: 128, bpmStatus: 'tagged', bpmConfidence: 1, bpmSource: 'ID3v2.3/TBPM' };
  expect(readStandaloneStreamedAudio({ project, value: [source] })[0]?.audioMetadata).toEqual({ bpm: 128, bpmStatus: 'tagged', bpmConfidence: 1, bpmSource: 'ID3v2.3/TBPM' });
});

test('injected exports select their dimension, preserve explicit overrides and retain generic-host compatibility', async () => {
  const entry = resolve(import.meta.dir, '../standalone-playable.ts');
  const load = async (define: Record<string, string>) => {
    const build = await Bun.build({ entrypoints: [entry], target: 'bun', format: 'esm', define });
    if (!build.success) throw new Error(build.logs.join('\n'));
    const source = await build.outputs[0]!.text();
    const loaded: unknown = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    if (!isRecord(loaded) || typeof loaded.createStandalonePlayableHtml !== 'function') throw Error('Missing standalone fixture export');
    const createHtml = loaded.createStandalonePlayableHtml;
    return { createStandalonePlayableHtml(options: Parameters<typeof createStandalonePlayableHtml>[0]) {
      const html: unknown = createHtml(options);
      if (typeof html !== 'string') throw Error('Standalone fixture returned non-text HTML');
      return html;
    } };
  };
  const selected = await load({ __HYPERFOCUS_STANDALONE_RUNTIME_2D_SOURCE__: '"two-d-runtime"', __HYPERFOCUS_STANDALONE_RUNTIME_3D_SOURCE__: '"three-d-runtime"', __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__: '"generic-runtime"' });
  const pair = { projectJson: files.projectJson, assetsArchive: files.assetsArchive };
  expect(selected.createStandalonePlayableHtml({ project: createDefaultProject(), ...pair })).toContain('<script>two-d-runtime</script>');
  expect(selected.createStandalonePlayableHtml({ project: fighter(), ...pair })).toContain('<script>three-d-runtime</script>');
  expect(selected.createStandalonePlayableHtml({ project: fighter(), ...files })).toContain('<script>globalThis.booted=true;</script>');
  const generic = await load({ __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__: '"generic-runtime"' });
  for (const project of [createDefaultProject(), fighter()]) expect(generic.createStandalonePlayableHtml({ project, ...pair })).toContain('<script>generic-runtime</script>');
  const unavailable = await load({ __HYPERFOCUS_STANDALONE_RUNTIME_3D_SOURCE__: '""', __HYPERFOCUS_STANDALONE_RUNTIME_SOURCE__: '"generic-runtime"' });
  expect(() => unavailable.createStandalonePlayableHtml({ project: fighter(), ...pair })).toThrow('runtime was not embedded');
});
function fighter() {
  const project = createDefaultProject('Fighter');
  project.extensions = { hyperfocus3D: { version: 1 }, hyperfocusCombat: { ...createCombatProject3D(), match: { difficulty: 3 },
    fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }] } };
  return { ...project, extensions: project.extensions };
}
test('offline and noncombat exports retain a closed connection policy', () => {
  const project = createDefaultProject('Offline');
  expect(supportsStandaloneCombatConnections(project)).toBe(false);
  expect(createStandalonePlayableHtml({ project, ...files })).toContain("connect-src 'none'");
  expect(createStandalonePlayableHtml({ project, ...files })).not.toContain('clerk.');
  expect(createStandalonePlayableHtml({ project: fighter(), ...files })).not.toContain('clerk.');
  expect(() => createStandalonePlayableHtml({ project, ...files, allowCombatConnections: true })).toThrow('supported two-fighter');
  expect(createStandalonePlayableHtml({ project: fighter(), ...files })).toContain("connect-src 'none'");
  const unsupported = fighter();
  const combat = { ...createCombatProject3D(), match: { difficulty: 3 },
    fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' as const }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' as const }] };
  unsupported.extensions.hyperfocusCombat = combat;
  combat.fighters.push({ entityId: 'c', actionPrefix: 'c:', control: 'dummy' });
  expect(() => supportsStandaloneCombatConnections(unsupported)).toThrow('one player and one opponent');
  expect(() => createStandalonePlayableHtml({ project: unsupported, ...files, allowCombatConnections: true })).toThrow('one player and one opponent');
});
test('explicit combat exports permit same-origin guest requests, secure sockets and local development sockets', () => {
  const project = fighter();expect(supportsStandaloneCombatConnections(project)).toBe(true);
  const html = createStandalonePlayableHtml({ project, ...files, allowCombatConnections: true });
  expect(html).toContain("connect-src 'self' wss: ws://127.0.0.1:* ws://localhost:*");
  expect(html).not.toContain('connect-src ws:');
  expect(html).not.toMatch(/new WebSocket|fetch\(/);
  project.scenes[0]!.entities[0]!.components.push({ id: 'custom', type: 'behavior', enabled: true, values: { module: './rules.ts' } });
  expect(supportsStandaloneCombatConnections(project)).toBe(false);
  expect(() => createStandalonePlayableHtml({ project, ...files, allowCombatConnections: true })).toThrow('without custom behaviors');
});

test('hosted combat policy permits numeric WebAssembly and documented Clerk resources without arbitrary HTTPS or JavaScript eval', () => {
  const html = createStandalonePlayableHtml({ project: fighter(), ...files, allowCombatConnections: true });
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)![1]!;
  const directives = new Map(policy.split(';').map(value => { const [key, ...sources] = value.trim().split(/\s+/);return [key, sources] as const; }));
  expect(directives.get('script-src')).toEqual(["'wasm-unsafe-eval'", "'unsafe-inline'", 'https://*.clerk.accounts.dev', 'https://challenges.cloudflare.com', 'https://*.protect.clerk.com']);
  expect(directives.get('connect-src')).toEqual(["'self'", 'wss:', 'ws://127.0.0.1:*', 'ws://localhost:*', 'https://*.clerk.accounts.dev', 'https://*.protect.clerk.com:*']);
  expect(directives.get('img-src')).toEqual(['data:', 'blob:', 'https://img.clerk.com']);
  expect(directives.get('worker-src')).toEqual(["'self'", 'blob:']);
  expect(directives.get('frame-src')).toEqual(['https://challenges.cloudflare.com', 'https://*.protect.clerk.com']);
  for (const sources of directives.values()) {
    expect(sources).not.toContain('https:');expect(sources).not.toContain('*');expect(sources).not.toContain("'unsafe-eval'");
    expect(sources).not.toContain('https://clerk.unconfigured.example');
  }
});

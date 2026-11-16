import { expect, test } from 'bun:test';
import { gunzipSync } from 'node:zlib';
import { createDemoDocument } from './demo-document.ts';
import { createDefaultProject } from '@hyperfocus/engine/project';
import { createCombatProject3D } from '@hyperfocus/engine/project/runtime-3d';
import { createStandalonePlayableHtml } from '@hyperfocus/engine/project';

const html = '<!doctype html><html><body>Fighter 🌙 — café</body></html>'.repeat(100);
const request = (encoding?: string, method = 'GET') => new Request('http://127.0.0.1/', { method, headers: encoding === undefined ? {} : { 'accept-encoding': encoding } });

test('negotiates gzip, explicit identity preference, wildcards and unavailable encodings', () => {
  const document = createDemoDocument({ html });
  for (const value of ['gzip', 'GZip;Q=1.000', 'br, gzip;q=0.5', '*', '*;q=0.5', 'identity;q=0, gzip;q=0.1', 'gzip;q=0.7,identity;q=0.5', '*;q=0,gzip;q=1', 'x-gzip']) {
    const response = document.respond(request(value));expect(response.status).toBe(200);expect(response.headers.get('content-encoding')).toBe('gzip');
  }
  for (const value of [undefined, '', 'br', 'gzip;q=0', 'gzip;q=0,*;q=1', 'gzip;q=0.5,identity;q=1', '*;q=0,identity;q=0.5']) {
    const response = document.respond(request(value));expect(response.status).toBe(200);expect(response.headers.has('content-encoding')).toBe(false);
  }
  for (const value of ['*;q=0', 'gzip;q=0,identity;q=0', 'br,identity;q=0', 'gzip;q=0,*;q=0']) expect(document.respond(request(value)).status).toBe(406);
});

test('malformed and conflicting weights never enable refused codings', () => {
  const document = createDemoDocument({ html });
  for (const value of ['gzip;q=garbage', 'gzip;q=2', 'gzip;q=-1', 'gzip;q=.5', 'gzip;q=0.0001', 'gzip;q="1"', 'gzip;q=0;q=1', 'gzip;q=0,gzip', 'gzip,gzip;q=0', 'gzip;q=1;extra=yes']) {
    expect(document.respond(request(`${value},*;q=1`)).headers.has('content-encoding')).toBe(false);
    expect(document.respond(request(`${value},identity;q=0,*;q=1`)).status).toBe(406);
  }
  expect(document.respond(request('*;q=broken')).status).toBe(406);
});

test('repeated responses preserve exact UTF-8 bytes, byte lengths and delivery headers', async () => {
  const document = createDemoDocument({ html }), expected = Buffer.from(html);
  for (let i = 0; i < 3; i++) for (const accepted of ['gzip', 'identity']) {
    const response = document.respond(request(accepted)), bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get('content-length')).toBe(String(bytes.byteLength));
    expect(accepted === 'gzip' ? gunzipSync(bytes) : bytes).toEqual(expected);
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    if (accepted === 'gzip') expect(bytes.byteLength).toBeLessThan(expected.byteLength);
  }
  const head = document.respond(request('gzip', 'HEAD'));
  expect((await head.arrayBuffer()).byteLength).toBe(0);
  expect(head.headers.get('content-length')).toBe(document.respond(request('gzip')).headers.get('content-length'));
  const refused = document.respond(request('*;q=0'));
  expect((await refused.arrayBuffer()).byteLength).toBe(0);expect(refused.headers.get('content-length')).toBe('0');
});

function exported(online = true) {
  const project = createDefaultProject('Hosted fighter');
  project.extensions = { hyperfocus3D: { version: 1 }, hyperfocusCombat: { ...createCombatProject3D(), match: { difficulty: 3 },
    fighters: [{ entityId: 'a', actionPrefix: 'a:', control: 'player' }, { entityId: 'b', actionPrefix: 'b:', control: 'dummy' }] } };
  return createStandalonePlayableHtml({ project, projectJson: new TextEncoder().encode('{"untouched":true}'), assetsArchive: new Uint8Array([1, 2, 3]), runtimeSource: 'globalThis.unchanged = true;', allowCombatConnections: online });
}
const policyMeta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/;

test('hosted Clerk adds only its exact configured origin without changing runtime, project or source artifact', async () => {
  const source = exported(), origin = 'https://clerk.fighters.example';
  const document = createDemoDocument({ html: source, clerkFrontendOrigin: origin });
  const served = await document.respond(request()).text();
  expect(source).not.toContain(origin);expect(served.replace(policyMeta, '')).toBe(source.replace(policyMeta, ''));
  const before = new Map(policyMeta.exec(source)![1]!.split(';').map(value => { const [name, ...sources] = value.trim().split(/\s+/);return [name, sources] as const; }));
  const after = new Map(policyMeta.exec(served)![1]!.split(';').map(value => { const [name, ...sources] = value.trim().split(/\s+/);return [name, sources] as const; }));
  for (const [name, sources] of before) expect(after.get(name)).toEqual(name === 'script-src' || name === 'connect-src' ? [...sources, origin] : sources);
  for (const sources of after.values()) { expect(sources).not.toContain('https:');expect(sources).not.toContain('*');expect(sources).not.toContain('https://clerk.foreign.example'); }
  expect(document.sourceSha256).toBe(new Bun.CryptoHasher('sha256').update(source).digest('hex'));
  expect(document.servedSha256).toBe(new Bun.CryptoHasher('sha256').update(served).digest('hex'));
  expect(document.servedSha256).not.toBe(document.sourceSha256);
  const compressed = document.respond(request('gzip')), bytes = Buffer.from(await compressed.arrayBuffer());
  expect(gunzipSync(bytes).toString('utf8')).toBe(served);expect(compressed.headers.get('content-length')).toBe(String(bytes.length));
  expect(await createDemoDocument({ html: served, clerkFrontendOrigin: origin }).respond(request()).text()).toBe(served);
});

test('unconfigured documents remain byte-identical; configured auth rejects offline or ambiguous policies', async () => {
  for (const source of [html, exported(), exported(false)]) {
    const document = createDemoDocument({ html: source });expect(await document.respond(request()).text()).toBe(source);expect(document.sourceSha256).toBe(document.servedSha256);
  }
  const origin = 'https://clerk.fighters.example', source = exported(), meta = policyMeta.exec(source)![0];
  for (const value of [html, exported(false), source.replace(meta, meta + meta), source.replace(/script-src [^;]+/, "script-src 'none'"), source.replace("connect-src 'self'", "connect-src 'none' 'self'"), source.replace('default-src', "connect-src 'self'; default-src")]) {
    expect(() => createDemoDocument({ html: value, clerkFrontendOrigin: origin })).toThrow();
  }
  for (const invalid of ['', 'http://clerk.example', 'https://clerk.example/', 'https://user:password@clerk.example', 'https://*.example', 'https://clerk.example/path', 'https://clerk.example?x=y', 'https://clerk.example#x', 'https://clerk.example; https://evil.example', 'https://clerk.example"']) {
    expect(() => createDemoDocument({ html: source, clerkFrontendOrigin: invalid })).toThrow('exact HTTPS origin');
  }
});

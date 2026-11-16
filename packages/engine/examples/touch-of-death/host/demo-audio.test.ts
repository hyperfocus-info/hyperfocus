import { expect, test } from 'bun:test';
import { createDefaultProject } from '@hyperfocus/engine/project';
import { createDemoAudio } from './demo-audio.ts';
import { createDemoOriginPolicy } from './public-origin.ts';

test('hosted music serves exact canonical bytes on both game origins without exposing other assets', async () => {
  const bytes = new Uint8Array([73, 68, 51, 0]), sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
  const project = createDefaultProject('Hosted music');
  project.assets.push({ id: 'song', name: 'song.mp3', kind: 'audio', source: 'imported', mimeType: 'audio/mpeg', size: bytes.length, lastModified: 0, sha256 });
  const source = { assetId: 'song', url: `audio/${sha256}.mp3`, sha256, size: bytes.length, durationSeconds: 1 };
  const html = `<script id="hyperfocus-project-pair">${JSON.stringify({ streamedAudio: [source] })}</script>`;
  const options = { html, project, assets: [{ id: 'song', mimeType: 'audio/mpeg', bytes }] };
  const audio = createDemoAudio(options), path = '/' + source.url;
  const policy = createDemoOriginPolicy({ port: 8802, publicOrigin: 'https://game.example', previewOrigin: 'https://preview.example', publicBinding: true, audioPaths: audio.paths });
  for (const host of ['game.example', 'preview.example']) {
    const request = new Request('http://127.0.0.1:8802' + path, { headers: { Host: host } });
    expect(policy.guard(request)).toBeUndefined();
    const response = audio.respond(request)!;
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    expect(policy.guard(new Request(request, { method: 'HEAD' }))).toBeUndefined();
    expect(await audio.respond(new Request(request, { method: 'HEAD' }))!.text()).toBe('');
    expect(policy.guard(new Request(request, { method: 'POST' }))?.status).toBe(403);
    expect(policy.guard(new Request(request, { headers: { Host: host, Upgrade: 'websocket', Origin: 'https://' + host } }))?.status).toBe(403);
    for (const other of ['/audio/private.mp3', '/project/.hyperfocus/assets.hfp', '/moderation']) {
      expect(policy.guard(new Request('http://127.0.0.1:8802' + other, { headers: { Host: host } }))?.status).toBeGreaterThanOrEqual(400);
      expect(audio.respond(new Request('http://127.0.0.1:8802' + other))).toBeUndefined();
    }
  }
  expect(() => createDemoAudio({ ...options, assets: [] })).toThrow('Missing or changed');
  expect(() => createDemoAudio({ ...options, assets: [{ ...options.assets[0]!, bytes: new Uint8Array([0, 0, 0, 0]) }] })).toThrow('Missing or changed');
  expect(createDemoAudio({ ...options, html: '<html></html>' }).paths.size).toBe(0);
});

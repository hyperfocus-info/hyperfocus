import { expect, test } from 'bun:test';
import { defineSchema } from '../../protocol/schema.ts';
import { createAuthoritativeServer } from '../server.ts';
import type { AuthoritativeServerOptions } from './server-contract.ts';

async function websocket(url: string) {
  const socket = new WebSocket(url);
  const opened = await new Promise<boolean>(resolve => { socket.onopen = () => resolve(true);socket.onerror = () => resolve(false);socket.onclose = () => resolve(false); });
  socket.close();return opened;
}
function fixture(requestGuard?: (request: Request) => unknown) {
  let handled = 0;
  const options: AuthoritativeServerOptions = { transport: 'websocket', hostname: '127.0.0.1', port: 0, devMode: true,
    rooms: [{ name: 'guarded', schema: defineSchema<{ count: number }>({ count: 'u32' }), createState: () => ({ count: 0 }), getSnapshot: ctx => ctx.state }],
    httpHandler() { handled++;return new Response('custom'); },
  };
  // Exercise JavaScript hosts returning values outside the declared port.
  Reflect.set(options, 'requestGuard', requestGuard);
  const server = createAuthoritativeServer(options);server.start();
  return { server, url: `http://127.0.0.1:${server.getStats().port}`, get handled() { return handled; } };
}

test('guard protects health, stats, custom HTTP and actual WebSocket upgrade before routing', async () => {
  const seen: string[] = [];
  const f = fixture(request => { seen.push(new URL(request.url).pathname);return new URL(request.url).searchParams.has('allow') ? undefined : new Response('denied', { status: 403 }); });
  try {
    for (const path of ['/healthz', '/stats.json', '/custom']) {
      const denied = await fetch(f.url + path);expect(denied.status).toBe(403);expect(await denied.text()).toBe('denied');
    }
    expect(f.handled).toBe(0);expect(await websocket(f.url.replace('http:', 'ws:') + '/socket')).toBe(false);
    expect(await (await fetch(f.url + '/healthz?allow')).text()).toBe('ok');
    expect((await fetch(f.url + '/stats.json?allow')).status).toBe(200);
    expect(await (await fetch(f.url + '/custom?allow')).text()).toBe('custom');expect(f.handled).toBe(1);
    expect(await websocket(f.url.replace('http:', 'ws:') + '/socket?allow')).toBe(true);
    expect(seen).toContain('/socket');expect(f.server.presence.count()).toBe(0);
  } finally { await f.server.stop(); }
});

test('throwing, invalid and accidentally asynchronous guards fail closed without leaking errors', async () => {
  for (const result of ['throw', null, false, Promise.resolve(undefined), Promise.resolve(new Response('must not allow'))]) {
    const guard = () => { if (result === 'throw') throw Error('private host secret');return result; };
    const f = fixture(guard);
    try {
      for (const path of ['/healthz', '/stats.json', '/custom']) {
        const response = await fetch(f.url + path);expect(response.status).toBe(503);expect(await response.text()).toBe('Service unavailable');
      }
      expect(await websocket(f.url.replace('http:', 'ws:'))).toBe(false);expect(f.handled).toBe(0);
    } finally { await f.server.stop(); }
  }
});

test('omitting request guard preserves built-in, custom and upgrade behavior', async () => {
  const f = fixture();
  try {
    expect(await (await fetch(f.url + '/healthz')).text()).toBe('ok');
    expect((await fetch(f.url + '/stats.json')).status).toBe(200);
    expect(await (await fetch(f.url + '/custom')).text()).toBe('custom');
    expect(await websocket(f.url.replace('http:', 'ws:'))).toBe(true);
  } finally { await f.server.stop(); }
});

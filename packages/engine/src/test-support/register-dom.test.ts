import { expect, test } from 'bun:test';
import { registerTestDom } from './register-dom.ts';

test('a native HTTP server still accepts responses after DOM registration', async () => {
  registerTestDom();
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => Response.json({ ready: true }) });
  try {
    const response = await fetch(server.url.href, { signal: AbortSignal.timeout(2000) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ready: true });
  } finally { await server.stop(true); }
});

test('DOM registration preserves native WebSocket while providing document APIs', () => {
  const socket = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  registerTestDom();
  expect(document.createElement('canvas').tagName).toBe('CANVAS');
  expect(Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')).toEqual(socket);
  const documentBefore = document;
  registerTestDom();
  expect(document).toBe(documentBefore);
  expect(Object.getOwnPropertyDescriptor(globalThis, 'WebSocket')).toEqual(socket);
});

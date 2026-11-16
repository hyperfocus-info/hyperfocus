import { parseProtocolMessage } from "../protocol/messages.ts";
import { expect, test } from 'bun:test';
import { connectAuthoritative } from './authoritative-client.ts';

async function until(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition timed out');
    await Bun.sleep(5);
  }
}

function createWebSocket(url: string) {
  const socket = new WebSocket(url);
  const on = Reflect.get(socket, 'on');
  if (typeof on === 'function') Reflect.apply(on, socket, ['error', () => undefined]);
  return socket;
}

function listen(port = 0, admit = true) {
  return Bun.serve({ port, hostname: '127.0.0.1',
    fetch(request, server) { return server.upgrade(request) ? undefined : new Response('websocket only'); },
    websocket: { message(socket, data) {
      const message = parseProtocolMessage(data);
      if (message.type === 'join_room' && admit) socket.send(JSON.stringify({ v: 1, type: 'join_accepted', payload: { playerId: 'player', roomId: 'room' } }));
    } }
  });
}

test('real socket recovery survives multiple refused attempts without publishing failed', async () => {
  let server = listen();
  const port = server.port!;
  const states: string[] = [], attempts: number[] = [];
  const client = connectAuthoritative({ createWebSocket, url: `ws://127.0.0.1:${port}`, getToken: ({ attempt }) => { attempts.push(attempt);return 'token'; },
    reconnect: { maxAttempts: 20, initialDelayMs: 10, maxDelayMs: 10 }, joinTimeoutMs: 100 });
  client.onState(state => states.push(state.status));
  try {
    await client.connect();
    server.stop(true);
    await until(() => attempts.length >= 4);
    expect(states).not.toContain('failed');
    server = listen(port);
    await until(() => client.getDebugSnapshot().connected);
    expect(states).not.toContain('failed');
    expect(attempts.slice(0, 4)).toEqual([0, 1, 2, 3]);
  } finally { client.close();server.stop(true); }
});

test('recovery admission timeout exhausts bounded attempts; initial admission fails promptly', async () => {
  let server = listen();
  const port = server.port!, states: string[] = [], attempts: number[] = [];
  const client = connectAuthoritative({ createWebSocket, url: `ws://127.0.0.1:${port}`, getToken: ({ attempt }) => { attempts.push(attempt);return 'token'; },
    reconnect: { maxAttempts: 2, initialDelayMs: 20, maxDelayMs: 20 }, joinTimeoutMs: 25 });
  client.onState(state => states.push(state.status));
  try {
    await client.connect();server.stop(true);server = listen(port, false);
    await until(() => client.getDebugSnapshot().state.status === 'failed');
    expect(attempts).toEqual([0, 1, 2]);
    expect(states.filter(state => state === 'failed')).toHaveLength(1);
    expect(client.getDebugSnapshot().state).toMatchObject({ reason: expect.stringContaining('exhausted') });
    const initial = connectAuthoritative({ createWebSocket, url: `ws://127.0.0.1:${port}`, token: 'token', joinTimeoutMs: 20,
      reconnect: { maxAttempts: 2, initialDelayMs: 1, maxDelayMs: 1 } });
    try {
      await expect(initial.connect()).rejects.toThrow('timed out');
      expect(initial.getDebugSnapshot().state.status).toBe('failed');
    } finally { initial.close(); }
  } finally { client.close();server.stop(true); }
});

test('a throwing socket send fences the transport and recovers without replaying the rejected input', async () => {
  const server = listen(), sockets: WebSocket[] = [];
  const client = connectAuthoritative({ url: `ws://127.0.0.1:${server.port}`, token: 'token',
    createWebSocket(url) { const socket = createWebSocket(url);sockets.push(socket);return socket; },
    reconnect: { maxAttempts: 2, initialDelayMs: 5, maxDelayMs: 5 } });
  try {
    await client.connect();
    const close = sockets[0]!.close.bind(sockets[0]!);
    const closeCodes: Array<number | undefined> = [];
    sockets[0]!.close = (code, reason) => { closeCodes.push(code);close(code, reason); };
    sockets[0]!.send = () => { throw new Error('transport unavailable'); };
    expect(client.sendInput({ move: 1 })).toEqual({ status: 'rejected', reason: 'transport-error' });
    expect(client.getDebugSnapshot().state.status).toBe('recovering');
    expect(closeCodes).toEqual([4002]);
    await until(() => client.getDebugSnapshot().connected);
    expect(sockets).toHaveLength(2);
    expect(client.getDebugSnapshot().sentInputs).toBe(0);
    expect(client.sendInput({ move: 2 })).toEqual({ status: 'sent', sequence: 1 });
  } finally { client.close();server.stop(true); }
});

test('explicit rejection during recovery is terminal and does not spend more attempts', async () => {
  let joins = 0;
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1',
    fetch(request, server) { return server.upgrade(request) ? undefined : new Response(); },
    websocket: { message(socket, data) {
      if (parseProtocolMessage(data).type !== 'join_room') return;
      joins++;
      socket.send(JSON.stringify(joins === 1
        ? { v: 1, type: 'join_accepted', payload: { playerId: 'player', roomId: 'room' } }
        : { v: 1, type: 'join_rejected', payload: { reason: 'auth expired' } }));
      if (joins === 1) setTimeout(() => socket.close(1011), 10);
    } }
  });
  const client = connectAuthoritative({ createWebSocket, url: `ws://127.0.0.1:${server.port}`, token: 'token',
    reconnect: { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1 } });
  try {
    await client.connect();await until(() => client.getDebugSnapshot().state.status === 'failed');await Bun.sleep(20);
    expect(joins).toBe(2);
    expect(client.getDebugSnapshot().state).toEqual({ status: 'failed', reason: 'auth expired' });
  } finally { client.close();server.stop(true); }
});

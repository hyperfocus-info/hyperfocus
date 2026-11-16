import { expect, test } from 'bun:test';
import { createLocalCpuUsage } from './cpu-usage.ts';

test('CPU endpoint measures busy deltas and restricts readings to loopback same-origin GET', async () => {
  let time = 0, user = 0, idle = 0;
  const handler = createLocalCpuUsage({ port: 8801, now: () => time, read: () => [{ model: '', speed: 1, times: { user, idle, nice: 0, sys: 0, irq: 0 } }] });
  const request = (headers = {}) => new Request('http://127.0.0.1:8801/tod-cpu-usage', { headers });
  expect((await handler(request())!.json()).percent).toBeNull();
  time = 1000;user = 30;idle = 70;
  expect((await handler(request())!.json()).percent).toBe(30);
  expect(handler(request({ origin: 'https://other.example' }))!.status).toBe(403);
  expect(handler(request({ 'sec-fetch-site': 'cross-site' }))!.status).toBe(403);
  expect(handler(new Request(request(), { method: 'POST' }))!.status).toBe(405);
  expect(createLocalCpuUsage({ port: 8801, publicBinding: true })(request())!.status).toBe(404);
});

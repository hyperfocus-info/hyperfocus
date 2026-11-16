import { expect, test } from 'bun:test';
import { createQuickPlayLatency } from './latency.ts';

test('bounded idle probes measure delayed clients without accepting supplied timing, duplicate or replaced-connection replies', () => {
  let now = 1000;const latency = createQuickPlayLatency({ now: () => now });latency.join('alice', 'one');
  const first = latency.probe('one')!;expect(latency.probe('one')).toBeUndefined();
  now += 100;latency.reply('one', first.nonce);latency.reply('one', first.nonce);latency.reply('one', 'forged');expect(latency.read('alice')).toBeUndefined();
  now += 400;const second = latency.probe('one')!;now += 150;latency.reply('one', second.nonce);expect(latency.read('alice')).toBe(150);
  latency.join('alice', 'two');latency.reply('two', second.nonce);latency.reply('one', first.nonce);expect(latency.read('alice')).toBeUndefined();
  const stale = latency.probe('two')!;now += 11000;latency.reply('two', stale.nonce);expect(latency.read('alice')).toBeUndefined();
});

test('host acknowledgements require current connection, bounded samples and fresh measurements', () => {
  let now = 1000;const latency = createQuickPlayLatency({ now: () => now });
  latency.join('alice', 'one');latency.ack('one', 99);expect(latency.read('alice')).toBeUndefined();
  latency.sent('one', 1);now += 40;latency.ack('one', 1);expect(latency.read('alice')).toBeUndefined();
  latency.sent('one', 2);now += 60;latency.ack('one', 2);expect(latency.read('alice')).toBe(60);
  now += 200;latency.ack('one', 2);expect(latency.read('alice')).toBe(60);
  now += 10000;expect(latency.read('alice')).toBeUndefined();
  latency.join('alice', 'two');latency.leave('one');latency.sent('one', 3);latency.ack('one', 3);expect(latency.read('alice')).toBeUndefined();
  for (let index = 0; index < 130; index++) latency.sent('two', index);
  now += 20;latency.ack('two', 0);latency.ack('two', 129);expect(latency.read('alice')).toBeUndefined();
  latency.ack('two', 128);expect(latency.read('alice')).toBe(20);
  latency.leave('two');expect(latency.read('alice')).toBeUndefined();
});

import { expect, test } from 'bun:test';
import { createConnectionQuality } from './connection-quality.ts';

function fixture() {
  let time = 0;
  const quality = createConnectionQuality({ matchId: 'match', seats: ['a', 'b'], now: () => time });
  const pending: Array<{ player: string; type: string; matchId: string; nonce: string }> = [];
  function tick(frames: number[] = [0, 0], skip: string[] = [], recovering = false) {
    for (const probe of pending.splice(0)) if (!skip.includes(probe.player)) quality.ack(probe.player, { ...probe, type: 'tod-quality-ack' });
    return quality.tick({ frames, recovering, send(player, probe) { pending.push({ player, ...probe }); } });
  }
  return { quality, tick, pending, advance(ms = 250) { time += ms; } };
}

test('strict rollback boundary and ten continuous seconds, with no loss from a single spike', () => {
  const f = fixture();
  for (let i = 0; i < 50; i++) { expect(f.tick([i * 15, i * 15 + 2])).toBeUndefined();f.advance(); }
  for (let i = 0; i < 40; i++) { expect(f.tick([1000 + i * 15, 1004 + i * 15])).toBeUndefined();f.advance(); }
  expect(f.tick([2000, 2004])).toMatchObject({ noContest: false });
});

test('recovery and host scheduling interruption reset the entire continuous interval', () => {
  const f = fixture();
  for (let i = 0; i < 35; i++) { expect(f.tick([i * 15, i * 15 + 4])).toBeUndefined();f.advance(); }
  f.advance(2000);expect(f.tick([600, 604])).toBeUndefined();
  for (let i = 0; i < 35; i++) { f.advance();expect(f.tick([700 + i * 15, 704 + i * 15])).toBeUndefined(); }
  f.advance();expect(f.tick([1400, 1404], [], true)).toBeUndefined();
  for (let i = 0; i < 35; i++) { f.advance();expect(f.tick([1500 + i * 15, 1504 + i * 15])).toBeUndefined(); }
});

test('unacknowledged probes warn without a loss and reject forged, stale and cross-seat replies', () => {
  const f = fixture();f.tick();const probe = f.pending.find(value => value.player === 'a')!;
  expect(f.quality.ack('b', { ...probe, type: 'tod-quality-ack' })).toBe(true);
  expect(f.quality.ack('a', { ...probe, type: 'tod-quality-ack', matchId: 'old' })).toBe(false);
  let result;
  for (let i = 0; i < 60 && !result; i++) { f.advance();result = f.tick([i * 15, i * 15], ['a']); }
  expect(result).toMatchObject({ noContest: false });
});

test('sustained bilateral host-probed degradation produces only an unrated no-contest', () => {
  const f = fixture();let result;
  for (let i = 0; i < 60 && !result; i++) { result = f.tick([i * 15, i * 15], ['a', 'b']);f.advance(); }
  expect(result).toMatchObject({ noContest: true });expect(result).not.toHaveProperty('winner');
});

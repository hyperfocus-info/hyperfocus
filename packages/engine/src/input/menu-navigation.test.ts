import { expect, test } from 'bun:test';
import { createMenuNavigationInput } from "./menu-navigation.ts";

test('held input moves immediately then repeats by elapsed time, at most once per sample', () => {
  for (const hz of [30, 60, 144]) {
    const nav = createMenuNavigationInput(), events: number[] = [];
    for (let frame = 0; frame <= hz; frame++) { const nowMs = frame * 1000 / hz;if (nav.sample({ nowMs, y: .9 })) events.push(nowMs); }
    expect(events[0]).toBe(0);expect(events[1]).toBeGreaterThanOrEqual(400);expect(events[1]).toBeLessThan(400 + 1000 / hz + 1);
    for (let i = 2; i < events.length; i++) expect(events[i]! - events[i - 1]!).toBeGreaterThanOrEqual(99.999999999);
    expect(events.length).toBeGreaterThanOrEqual(6);expect(events.length).toBeLessThanOrEqual(8);
    expect(nav.sample({ nowMs: 60000, y: .9 })).toBe('down');expect(nav.sample({ nowMs: 60000, y: .9 })).toBeUndefined();
  }
});

test('drift, threshold chatter and near-diagonal noise cannot create extra moves', () => {
  const nav = createMenuNavigationInput();
  expect(nav.sample({ nowMs: 0, x: .2, y: -.3 })).toBeUndefined();
  expect(nav.sample({ nowMs: 1, x: .7, y: .65 })).toBe('right');
  for (let i = 2; i < 20; i++) expect(nav.sample({ nowMs: i, x: i % 2 ? .61 : .59, y: .62 })).toBeUndefined();
  expect(nav.sample({ nowMs: 20, x: .4, y: .9 })).toBe('down');
  expect(nav.sample({ nowMs: 21, y: -.9 })).toBe('up');
  expect(nav.sample({ nowMs: 22 })).toBeUndefined();expect(nav.sample({ nowMs: 23, y: -.9 })).toBe('up');
});

test('digital direction takes priority and menu handoff requires neutral before repeating', () => {
  const nav = createMenuNavigationInput();
  expect(nav.sample({ nowMs: 0, x: 1, digital: { x: 0, y: -1 } })).toBe('up');
  nav.reset({ waitForNeutral: true });
  expect(nav.sample({ nowMs: 900, y: -1 })).toBeUndefined();expect(nav.sample({ nowMs: 1900, y: -1 })).toBeUndefined();
  nav.sample({ nowMs: 2000 });expect(nav.sample({ nowMs: 2001, y: 1 })).toBe('down');
  expect(nav.sample({ nowMs: 1, y: 1 })).toBeUndefined();
  nav.sample({ nowMs: 2, x: NaN, y: Infinity });expect(nav.sample({ nowMs: 3, x: -1 })).toBe('left');
  expect(nav.sample({ nowMs: 4, x: -1, digital: { x: 0, y: 0 } })).toBeUndefined();
});

test('invalid timing and threshold configuration fails before accepting input', () => {
  for (const options of [{ intervalMs: 0 }, { delayMs: -1 }, { release: .8 }, { engage: NaN }, { axisBias: Infinity }]) expect(() => createMenuNavigationInput(options)).toThrow();
  expect(() => createMenuNavigationInput().sample({ nowMs: NaN })).toThrow();
});

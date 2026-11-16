import { expect, test } from 'bun:test';
import { createCombatSimulation } from '../../../combat/simulation.ts';
import { createTouchOfDeathPreset } from '../../../combat/touch-of-death.ts';
import { createCombatExchange3D } from './exchange.ts';

function fixture() {
  const config = createTouchOfDeathPreset();
  config.parryFrames = 0;
  config.moves = [{ ...config.moves[0]!, startupFrames: 0, activeFrames: 1, recoveryFrames: 0, hitRecoveryFrames: 0, damage: 60, hitstunFrames: 12, cancels: [] }];
  const simulation = createCombatSimulation({ config, fighters: [
    { id: 'a', position: { x: -1, y: 0, z: 0 } },
    { id: 'b', position: { x: 0, y: 0, z: 0 }, facing: { x: 1, y: 0, z: 0 } },
  ] });
  return { simulation, exchange: createCombatExchange3D() };
}

test('defense lessons use the actual cause and leave unsupported situations in free Practice', () => {
  const exchange = createCombatExchange3D();
  expect(exchange.defensePractice('a')).toBe('neutral');
  for (const [reason, preset] of [['missed-surface-recovery', 'tech-drill'], ['hit-recoil', 'di-drill'], ['guard-not-held', 'parry-drill'], ['outside-guard-arc', 'neutral'], ['grapple-not-teched', 'neutral'], ['traffic-impact', 'neutral'], ['attack-commitment', 'neutral']] as const) {
    exchange.restore([{ id:'contact', frame:10, attackerId:'b', targetId:'a', moveId:'heavy', kind:'hit', damage:10, reason, decisive:true, previousId:'' }]);
    expect(exchange.defensePractice('a')).toBe(preset);expect(exchange.defensePractice('b')).toBe('neutral');
  }
});

test('decisive chain explains actual cross-up opening and subsequent hit recoil', () => {
  const { simulation, exchange } = fixture();
  for (let frame = 0; frame < 2; frame++) {
    const before = simulation.capture();
    const events = simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }, { fighterId: 'b', guard: true }], contacts: [{ attackerId: 'a', targetId: 'b' }] });
    exchange.observe(before, simulation.capture(), events);
  }
  expect(exchange.capture().map(entry => entry.reason)).toEqual(['outside-guard-arc', 'hit-recoil']);
  expect(exchange.capture()[1]?.previousId).toBe(exchange.capture()[0]?.id);
  expect(exchange.summary()?.text).toContain('Decisive contact');
  expect(exchange.summary()?.text).toContain('Opening at combat frame 0');
  expect(exchange.summary()?.text).toContain('outside the forward guard arc');
  expect(exchange.summary()?.nextAttempt).toContain('turning toward the attacker');
  expect(exchange.summary()?.nextAttempt).not.toContain('knocked back');
  const base = { title: 'Fight', layout: 'fight' as const };
  expect(exchange.presentation(base)).toBe(base);
  expect(exchange.presentation({ title: 'Result', layout: 'result', overlay: { title: 'AI wins', body: '0 - 3' } }).overlay?.body).toContain(exchange.summary()!.text);
  const body = exchange.presentation({ title: 'Result', layout: 'result', overlay: { title: 'AI wins', body: '0 - 3' } }).overlay!.body;
  expect(body.indexOf(exchange.summary()!.nextAttempt)).toBeLessThan(body.indexOf('Decisive contact'));
  const saved = exchange.capture();exchange.reset();expect(exchange.summary()).toBeUndefined();exchange.restore(saved);expect(exchange.capture()).toEqual(saved);
});

test('bounded causal records deduplicate rollback events and reject malformed restore atomically', () => {
  const { simulation, exchange } = fixture(), before = simulation.capture();
  const event = simulation.step({ inputs: [{ fighterId: 'a', pressed: ['jab'] }], contacts: [{ attackerId: 'a', targetId: 'b' }] })[0]!;
  for (let frame = 0; frame < 100; frame++) exchange.observe(before, before, [{ ...event, frame, id: String(frame) }]);
  const saved = exchange.capture();expect(saved).toHaveLength(64);
  exchange.observe(before, before, [{ ...event, frame: 99, id: '99' }]);expect(exchange.capture()).toEqual(saved);
  expect(() => exchange.restore([{ ...saved[0], reason: 'invented-counter' }])).toThrow();expect(exchange.capture()).toEqual(saved);
  expect(exchange.validate(undefined)).toEqual([]);
});

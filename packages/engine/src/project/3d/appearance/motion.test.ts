import { expect, test } from 'bun:test';
import { createFighter, type CombatSnapshot } from '../../../combat/state.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { sample3DFrame } from '../../runtime-3d.ts';
import { applyAppearanceMotion3D } from './motion.ts';

test('cosmetic motion keeps hands, root, defensive cues and simulation immutable; action gating suppresses stance overrides', async () => {
  const fixture = await combatMotionFixture();
  const frame = sample3DFrame({ declaration: fixture.runtime.declaration, clock: { kind: 'simulation', tick: 4, ticksPerSecond: 60 }, viewport: { width: 800, height: 600 } });
  const template = frame.entities[0]!;
  for (const [index, suffix] of [':left-arm', ':left-forearm', ':left-hand', ':head', ':hair', ':face', ':trail:0', ':spark:0', ':guard', ':dust:0'].entries()) {
    frame.entities.push({ ...structuredClone(template), id: `a${suffix}`, position: [index * .1, 1, 0], scale: [.1, .1, .1] });
  }
  const state: CombatSnapshot = { version: 1, configKey: '', frame: 4, fighters: [createFighter({ id: 'a', position: { x: 0, y: 1, z: 0 } }, 100)] };
  const before = structuredClone(frame), stateBefore = structuredClone(state);
  const resolved = { variants: [], colors: [], styles: [{ actorId: 'a', channel: 'movement' as const, style: 'loose' }, { actorId: 'a', channel: 'particles' as const, style: 'ribbons' }] };
  applyAppearanceMotion3D({ frame, resolved, state });
  expect(frame.entities.find(entity => entity.id === 'a:left-arm')).not.toEqual(before.entities.find(entity => entity.id === 'a:left-arm'));
  expect(frame.entities.find(entity => entity.id === 'a:dust:0')!.scale).not.toEqual([.1, .1, .1]);
  for (const id of ['a', 'a:left-hand', 'a:spark:0', 'a:guard', 'a:trail:0']) expect(frame.entities.find(entity => entity.id === id)).toEqual(before.entities.find(entity => entity.id === id));
  expect(state).toEqual(stateBefore);
  for (const changes of [{ moveId: 'jab' }, { guarding: true }, { stunFrames: 5 }]) {
    const active = structuredClone(before);Object.assign(state.fighters[0]!, stateBefore.fighters[0], changes);
    applyAppearanceMotion3D({ frame: active, state, resolved: { ...resolved, styles: resolved.styles.slice(0, 1) } });expect(active).toEqual(before);
  }
  state.fighters[0]!.stunKind = 'hit';state.fighters[0]!.stunFrames = 12;
  const recoil = structuredClone(before);
  applyAppearanceMotion3D({ frame: recoil, state, resolved: { variants: [], colors: [], styles: [{ actorId: 'a', channel: 'hit', style: 'snap' }] } });
  expect(recoil.entities.find(entity => entity.id === 'a:head')!.rotation).not.toEqual(before.entities.find(entity => entity.id === 'a:head')!.rotation);
  expect(recoil.entities.find(entity => entity.id === 'a:head')!.position).toEqual(before.entities.find(entity => entity.id === 'a:head')!.position);
  const reduced = structuredClone(before);applyAppearanceMotion3D({ frame: reduced, state, resolved, reducedMotion: true });
  expect(reduced.entities.find(entity => entity.id === 'a:left-arm')).toEqual(before.entities.find(entity => entity.id === 'a:left-arm'));
});

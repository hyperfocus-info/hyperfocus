// This diagnostic deliberately executes current source, independently of built package artifacts.
import { createTouchOfDeathPreset } from '../../src/combat/preset.ts';
import { createCombatSimulation } from '@hyperfocus/engine/combat';
import { createCombatAi3D } from '@hyperfocus/engine/project/runtime-3d';

const config = createTouchOfDeathPreset();
const evidence = [];
for (const [trait, distance, stamina] of [['fast', 1.6, 100], ['defensive', 1.6, 12], ['defensive', 4, 12], ['grappler', 1.6, 100]] as const) {
  const state = createCombatSimulation({ config, fighters: [{ id: 'ai', position: { x: 0, y: 1, z: 0 } }, { id: 'target', position: { x: distance, y: 1, z: 0 } }] }).capture();
  state.fighters[0]!.stamina = stamina;
  const observation = { state, fighterId: 'ai', targetId: 'target', difficulty: 9, grounded: true, targetGrounded: true, seed: 1,
    grab: { range: 2.4, startupFrames: 8 }, body: { x: 0, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 },
    targetBody: { x: distance, y: 1, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0 } };
  const brain = createCombatAi3D({ config, tuning: { mode: 'adaptive', compression: false } });brain.step(observation);
  const initial = brain.capture();
  const preferences: Record<string, number> = initial.personality!.preferences;
  for (const key of Object.keys(preferences)) preferences[key] = 1;
  const rows = [];
  for (const value of [.3, 1.7]) {
    const memory = structuredClone(initial);memory.tick = 0;
    memory.personality!.preferences[trait] = value;brain.restore(memory);brain.step(observation);
    rows.push({ value, distribution: brain.learning()?.traces.at(-1)?.candidates });
  }
  const row = { trait, state: { distance, stamina, grounded: true, enemy: 'neutral', difficulty: 9 }, rows };
  evidence.push(row);console.log(JSON.stringify(row));
}
const outputIndex = process.argv.indexOf('--out');
if (outputIndex >= 0) {
  const files = ['packages/engine/src/project/3d/combat-ai.ts', 'packages/engine/src/project/3d/combat-ai/policy/style.ts', 'packages/engine/src/project/3d/combat-ai/policy/candidates.ts'];
  const sourceDigests = Object.fromEntries(await Promise.all(files.map(async path => [path, new Bun.CryptoHasher('sha256').update(await Bun.file(path).text()).digest('hex')])));
  await Bun.write(process.argv[outputIndex + 1]!, JSON.stringify({ source: 'current-source', capturedAt: new Date().toISOString(), sourceDigests, evidence }, null, 2));
}

import { expect, test } from 'bun:test';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { auditCombatProject3D } from '../combat-preflight.ts';
import type { Hyperfocus3DDiagnostic } from '../declaration.ts';

test('preflight rejects missing or fighter weapon references before runtime construction', async () => {
  const { project, runtime } = await combatMotionFixture();
  for (const entityId of ['missing', 'a', 'floor']) {
    const diagnostics: Hyperfocus3DDiagnostic[] = [];
    const combat = { ...project.extensions.hyperfocusCombat, interactions: { weapons: [{ entityId, material: 'wood', durability: 30, length: 1, lightMoveId: 'jab', heavyMoveId: 'heavy' }] } };
    auditCombatProject3D({ project: { ...project, extensions: { ...project.extensions, hyperfocusCombat: combat } }, declaration: runtime.declaration, diagnostics });
    expect(diagnostics.filter(item => item.code === 'combat-weapon')).toHaveLength(entityId === 'floor' ? 0 : 1);
    if (entityId !== 'floor') expect(diagnostics[0]?.pointer).toBe('/extensions/hyperfocusCombat/interactions/weapons/0/entityId');
  }
});

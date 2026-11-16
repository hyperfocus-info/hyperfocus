import { expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('combat, fixed-step runtime and their collision owners use portable simulation math', async () => {
  const root = resolve(import.meta.dir, '../../..');
  const owners = new Set([
    'project/runtime-3d.ts', 'project/3d/declaration.ts', 'project/3d/runtime-assets.ts', 'project/3d/runtime-commands.ts',
    'project/3d/runtime/checkpoint.ts', 'project/3d/motion/platform-motion.ts',
    'physics/3d.ts', 'physics/3d-overlap.ts', 'physics/terrain/static-raycast.ts',
  ]);
  for (const folder of ['combat', 'project/3d', 'physics']) {
    for (const filename of await readdir(resolve(root, folder), { recursive: true })) {
      const path = `${folder}/${filename.replaceAll('\\', '/')}`;
      if (!path.endsWith('.ts') || path.endsWith('.test.ts') || path.includes('fixture')) continue;
      if (folder === 'combat' || folder === 'project/3d' && filename.startsWith('combat')
        || folder === 'physics' && /^(rigid|ragdoll|collision3d)/.test(filename)) owners.add(path);
    }
  }
  for (const path of owners) {
    const source = await Bun.file(resolve(root, path)).text();
    expect(source, path).not.toMatch(/Math\.(?:sin|cos|tan|atan2|acos|hypot|sqrt)\s*\(/);
    expect(source, path).not.toMatch(/(?:const|let|var)\s+Math\s*=/);
    expect(source, path).not.toMatch(/from\s+['"]['"]/);
  }
  expect(await Bun.file(resolve(root, 'project/3d/combat-ai.ts')).text()).not.toMatch(/Math\.pow\s*\(/);
});

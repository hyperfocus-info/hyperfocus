/** Portable lab correctness, separate from CPU performance and browser acceptance. */
export const touchOfDeathLabSwarmRecipe = {
  id: 'touch-of-death-lab',
  name: 'Touch of Death lab verification and repair',
  executionKind: 'engineering' as const,
  preparationCommand: 'bun install --frozen-lockfile && bun run --cwd packages/engine build:types',
  validationCommands: [
    'bun test spikes/persistent-world-worker/lab/build/materials/native-material-revisions.test.ts spikes/persistent-world-worker/lab/build/native-display-options.test.ts spikes/persistent-world-worker/lab/build/native-strategies.test.ts spikes/persistent-world-worker/lab/runner/native-config.test.ts spikes/persistent-world-worker/lab/runner/native-verification.test.ts spikes/persistent-world-worker/lab/runner/raster/probe.test.ts spikes/persistent-world-worker/lab/shared-native.test.ts ./.agents/skills/dev-server/scripts/surfaces.test.ts --timeout 30000',
    'bun x tsc -p spikes/persistent-world-worker/lab/tsconfig.json',
    'bun run check:agent-guidance && bun run check:process-policy',
  ],
  ownedPaths: ['spikes/persistent-world-worker/', 'packages/engine/src/', 'packages/engine/examples/touch-of-death/src/',
    'apps/engine-editor/src/standalone/', '.agents/skills/dev-server/scripts/', 'package.json', 'bun.lock'],
  validationPaths: ['spikes/persistent-world-worker/lab/runner', 'spikes/persistent-world-worker/lab/build',
    'spikes/persistent-world-worker/lab/tsconfig.json', '.agents/skills/dev-server/scripts/surfaces.test.ts', 'package.json', 'bun.lock'],
  blockedPromotionReasons: [],
};

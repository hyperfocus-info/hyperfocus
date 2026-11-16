/** First consumer of the generic engineering lane; commands remain host configuration. */
export const touchOfDeathTutorialSwarmRecipe = {
  id: 'touch-of-death-tutorial',
  name: 'Touch of Death tutorial engineering and user audits',
  executionKind: 'engineering' as const,
  preparationCommand: 'bun install --frozen-lockfile && bun apps/engine-editor/node_modules/playwright-core/cli.js install --with-deps chromium',
  validationCommands: [
    'bun test apps/harness/cli/src/swarm/execution apps/harness/cli/src/swarm/campaign.test.ts packages/ai-core/src/swarm/review-controller.test.ts --timeout 30000',
    'HARNESS_TEST_SKIP_UI_PRELOAD=0 bun test --conditions=browser packages/ui/src/tutorial apps/engine-editor/src/scene3d/tutorial apps/engine-editor/src/scene3d/game-menu apps/engine-editor/src/scene3d/gamepad-input.test.ts apps/engine-editor/src/scene3d/input/gamepad-menu.test.ts apps/engine-editor/src/scene3d/input/physical-actions.test.ts --timeout 30000',
    'HARNESS_TEST_SKIP_UI_PRELOAD=0 bun test --conditions=browser packages/engine/examples/touch-of-death/src/rewards apps/engine-editor/src/scene3d/rewards --timeout 30000',
    'bun apps/engine-editor/scripts/tutorial-composition/swarm.ts --verify',
  ],
  artifactPaths: ['.local/tutorial-audit/report.json', '.local/tutorial-audit/persona-run.json', ...['movement', 'combo', 'combo-demo', 'hints-off', 'controller', 'completion', 'narrow', 'narrow-enlarged'].map(name => `.local/tutorial-audit/${name}.png`)],
  ownedPaths: ['apps/engine-editor/src/scene3d/tutorial/', 'apps/engine-editor/src/scene3d/game-menu/', 'apps/engine-editor/src/scene3d/input/', 'apps/engine-editor/src/scene3d/rewards/',
    'apps/engine-editor/src/scene3d/gamepad-input.ts', 'apps/engine-editor/src/scene3d/gamepad-menu.ts', 'apps/engine-editor/src/standalone-3d.ts', 'apps/engine-editor/src/standalone/world/controller.ts',
    'apps/engine-editor/scripts/tutorial-composition/', 'packages/ui/src/tutorial/', 'packages/engine/src/', 'packages/engine/examples/touch-of-death/src/'],
  validationPaths: ['apps/engine-editor/scripts/tutorial-composition'],
  blockedPromotionReasons: [],
};

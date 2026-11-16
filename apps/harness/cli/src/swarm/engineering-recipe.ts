/** General repository work; specialized projects can provide narrower trusted gates. */
export const engineeringSwarmRecipe = {
  id: 'engineering',
  name: 'Repository engineering and bulk work',
  executionKind: 'engineering' as const,
  preparationCommand: 'bun install --frozen-lockfile',
  validationCommands: ['HARNESS_TEST_SKIP_UI_PRELOAD=0 bun run check'],
  ownedPaths: ['apps/', 'packages/', 'scripts/', 'docs/', 'spikes/', 'package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'tsconfig.packages.json', 'eslint.config.mjs', 'AGENTS.md', 'README.md', 'DESIGN.md'],
  validationPaths: ['scripts', 'apps/harness/scripts', 'apps/engine-editor/scripts', 'packages/engine/scripts', 'package.json', 'bun.lock', 'bunfig.toml', 'tsconfig.json', 'tsconfig.packages.json', 'eslint.config.mjs'],
};

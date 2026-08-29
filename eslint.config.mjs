import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import stylex from "@stylexjs/eslint-plugin";
import hyperfocus from "./scripts/eslint-plugin-hyperfocus.ts";

const typedSourceFiles = [
  "packages/**/*.{ts,tsx}",
  "apps/harness/cli/src/**/*.{ts,tsx}",
  "apps/harness/scripts/**/*.{ts,tsx}",
  "packages/engine/examples/**/*.{ts,tsx}",
  "packages/engine/src/**/*.{ts,tsx}",
  "packages/engine/scripts/**/*.{ts,tsx}",
  "scripts/**/*.{ts,tsx}"
];
const repositorySourceFiles = [
  ...typedSourceFiles,
  "apps/harness/ui/src/**/*.{ts,tsx}",
  "apps/engine-editor/**/*.{ts,tsx}"
];
const canonicalImportIgnoredGlobs = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.browser-build.ts",
  "apps/harness/cli/src/ui-build.ts",
  "apps/harness/scripts/**/*.{ts,tsx}",
  "packages/engine/examples/*/build.ts",
  "packages/engine/examples/*/server.ts",
  "packages/engine/scripts/**/*.{ts,tsx}",
  "packages/ui/build.ts"
];

// These surfaces are being decomposed separately. They retain StyleX validation,
// but unused-symbol enforcement should only be enabled after their existing
// findings have been cleaned up in the owning workstream.
export const deferredUnusedSymbolGlobs = [
  "apps/harness/ui/**",
  "apps/engine-editor/**"
];

// Remove entries as each file is cleaned. New and already-clean files treat
// unused symbols as errors; these known legacy files remain visible warnings
// and `eslint --fix` still removes their unused imports automatically.
export const legacyUnusedSymbolFiles = [
  "apps/harness/cli/src/agent-runtimes/codex-sdk-adapter.ts",
  "apps/harness/cli/src/agent-runtimes/runtime-registry.ts",
  "apps/harness/cli/src/assistant-manager.ts",
  "apps/harness/cli/src/background-job-executor.ts",
  "apps/harness/cli/src/background-job-scheduler.test.ts",
  "apps/harness/cli/src/background-job-scheduler.ts",
  "apps/harness/cli/src/branchfs-subagent-integration.test.ts",
  "apps/harness/cli/src/launch-harness.test.ts",
  "apps/harness/cli/src/pi-orchestrator.ts",
  "apps/harness/cli/src/pi-subagents.test.ts",
  "apps/harness/cli/src/server.ts",
  "apps/harness/cli/src/test-support/server-test-harness.ts",
  "apps/harness/cli/src/workspace-repository.ts",
  "packages/engine/scripts/export-project.ts",
  "packages/engine/src/math/broadphase.ts",
  "packages/engine/src/mmo/entity-collection.ts",
  "packages/engine/src/mmo/interest.ts",
  "packages/engine/src/motion/runtime.ts",
  "packages/engine/src/motion/three.ts",
  "packages/engine/src/physics/2d.ts",
  "packages/engine/src/protocol/delta.ts",
  "packages/engine/src/render/effects.ts",
  "packages/engine/src/render/hud.ts",
  "packages/engine/src/render/index.test.ts",
  "packages/engine/src/server/core/types.ts",
  "packages/engine/src/sync/shared-store.ts",
  "packages/engine/src/ui/index.ts"
];

const unusedSymbolsOptions = {
  args: "after-used",
  argsIgnorePattern: "^_",
  caughtErrors: "none",
  enableAutofixRemoval: { imports: true },
  ignoreRestSiblings: true,
  varsIgnorePattern: "^_"
};

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "packages/engine/browser/**"]
  },
  {
    files: repositorySourceFiles,
    ignores: canonicalImportIgnoredGlobs,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { hyperfocus },
    rules: {
      "hyperfocus/canonical-imports": "warn"
    }
  },
  {
    files: typedSourceFiles,
    ignores: deferredUnusedSymbolGlobs,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", unusedSymbolsOptions]
    }
  },
  {
    files: legacyUnusedSymbolFiles,
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", unusedSymbolsOptions]
    }
  },
  {
    files: ["packages/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { "@stylexjs": stylex },
    rules: {
      "@stylexjs/valid-styles": "error",
      "@stylexjs/no-unused": "error",
      "@stylexjs/valid-shorthands": "warn",
      "@stylexjs/sort-keys": "warn"
    }
  }
];

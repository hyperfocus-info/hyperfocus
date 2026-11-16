import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import stylex from "@stylexjs/eslint-plugin";
import hyperfocus from "./scripts/eslint-plugin-hyperfocus.ts";
import { WEBSITE_ARCHIVE_CODE_GLOB } from './scripts/source-artifacts.ts';

const typedSourceFiles = [
  "packages/**/*.{ts,tsx}",
  "apps/**/*.{ts,tsx}",
  "scripts/**/*.{ts,tsx}",
  ".agents/skills/**/scripts/**/*.{ts,tsx}"
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
    files: ["apps/pad-pilot/ui/src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    plugins: { hyperfocus },
    rules: { "hyperfocus/padpilot-module": "error" },
  },
  {
    ignores: ["**/.local/**", "**/dist/**", "**/node_modules/**", "**/proto/generated/**", "packages/serialization/src/generated/**", "scripts/serialization/generated/**", "**/coverage/**", "apps/pad-pilot/build/**", "apps/pad-pilot-marketplace/data/**", "packages/engine/browser/**", WEBSITE_ARCHIVE_CODE_GLOB]
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error", reportUnusedInlineConfigs: "error" }
  },
  {
    files: ["packages/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}", "apps/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}", "scripts/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}", ".agents/skills/**/scripts/**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } }
    },
    plugins: { hyperfocus, "@typescript-eslint": tseslint },
    rules: {
      "no-async-promise-executor": "error",
      "no-constant-binary-expression": "error",
      "no-unreachable": "error",
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-expect-error": "allow-with-description",
        minimumDescriptionLength: 10
      }],
      "hyperfocus/computed-numeric-literals": "error",
      "hyperfocus/utility-modules": "error",
      "hyperfocus/canonical-utilities": "error",
      "hyperfocus/no-prop-drilling": "error",
      "hyperfocus/solid-list-rendering": "error",
      "hyperfocus/no-derived-signal-effect": "error",
      "hyperfocus/attention": "error",
      "hyperfocus/direct-implementation-imports": "error"
    }
  },
  {
    // Enforce repaired foundations and host adapters; expand after checking legacy consumers.
    files: ["packages/ui/src/primitives/**/*.{ts,tsx}", "packages/ui/src/form/**/*.{ts,tsx}", "packages/ui/src/preferences/**/*.{ts,tsx}", "packages/ui/src/task-review/**/*.{ts,tsx}",
      "apps/pad-pilot/ui/src/components/elements/**/*.{ts,tsx}", "apps/harness/ui/src/components/primitives/button.tsx",
      "apps/harness/ui/src/components/chat-panel*.{ts,tsx}", "apps/harness/ui/src/components/chat-panel/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "hyperfocus/ui-foundation": "error" }
  },
  {
    files: typedSourceFiles,
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
      "hyperfocus/canonical-imports": "error"
    }
  },
  {
    files: ['packages/engine/src/{runtime,wasm,physics}/**/*.{ts,tsx}'],
    rules: { 'hyperfocus/explicit-map-presence': 'error' }
  },
  {
    files: typedSourceFiles,
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
      "@stylexjs/valid-shorthands": "error",
      "@stylexjs/sort-keys": "error"
    }
  }
];

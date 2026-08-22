import tsParser from "@typescript-eslint/parser";
import stylex from "@stylexjs/eslint-plugin";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "engine/browser/**"]
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


import tsParser from "@typescript-eslint/parser";
import stylex from "@stylexjs/eslint-plugin";

export default [
  {
    files: ["ui/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "@stylexjs": stylex
    },
    rules: {
      "@stylexjs/valid-styles": "error",
      "@stylexjs/no-unused": "error"
    }
  }
];

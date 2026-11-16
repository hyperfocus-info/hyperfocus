export const DEFAULT_CODING_STACK =
  "TypeScript, Bun runtime, bun test, bun:sqlite when persistence is needed, SolidJS + StyleX when UI is needed, Bun + Happy DOM frontend tests, and existing shared primitives where applicable";

export const DEFAULT_CODING_STACK_GUIDANCE =
  `For new coding projects with no explicit stack, default to ${DEFAULT_CODING_STACK} unless existing project files or user preference say otherwise.`;

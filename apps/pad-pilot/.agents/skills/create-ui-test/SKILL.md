---
name: create-ui-test
description: Workflow for creating or updating behavior-first UI tests for SolidJS components, PadPilot elements, UI modules, and provider or bridge-facing UI behavior. Use when replacing brittle source-string assertions, adding DOM interaction coverage, or building colocated UI tests with Bun and @solidjs/testing-library.
---

# UI Test Authoring

Use this skill when working on `ui/src/**/*.test.ts[x]`, UI-facing provider tests, or colocated behavior tests for SolidJS components.

## Goals

- Verify public behavior through rendered DOM, exported functions, and public module boundaries.
- Replace source-string assertions with executable tests.
- Follow vertical TDD slices: one behavior, one failing test, one implementation step.

## Required workflow

1. Inspect the component, helper, or module and list the user-visible behaviors that matter.
2. Start with one tracer-bullet behavior that proves the harness and boundary work end to end.
3. Use `createUiTest()` from `apps/pad-pilot/utils/tests/test-harness` for DOM-oriented suites.
4. Prefer `render`, `screen`, `fireEvent`, and accessible queries from `@solidjs/testing-library`.
5. For pure logic helpers, test input/output behavior directly without rendering.
6. For provider, bridge, and runtime tests, exercise public methods or exported callbacks instead of source inspection.
7. Keep tests colocated next to the file they verify.
8. Run the UI suite with `bun test --conditions browser --preload ./ui/src/test-setup.ts` or the equivalent package script.

## Test selection guidance

- Use DOM render tests for components, elements, and modules.
- Use pure function tests for helpers, mappers, serialization, normalization, and sorting logic.
- Use contract tests only at real public boundaries such as exported bridge functions, runtime APIs, or codec round-trips.

## Default coverage expectations

- Cover initial render state.
- Cover the primary interaction path.
- Cover prop forwarding and accessibility roles or labels when relevant.
- Cover cleanup or close behavior for modals, drawers, and tooltips.
- Aim for >85% coverage on touched UI files when practical.

## Anti-patterns

- Do not use `Bun.file(...).text()` to assert UI behavior.
- Do not assert implementation text, JSX structure strings, or private helper names.
- Do not test private internals when an exported function or user-visible behavior exists.
- Do not batch-write a whole file of imagined tests before validating the first slice.

## Recommended patterns

- Tooltip:
  - hidden initially
  - visible on hover
  - hidden on unhover
  - visible on focus
  - hidden on blur
- Modal or Drawer:
  - renders when open
  - closes through public callbacks
  - traps or restores focus only through exported behavior
- Module:
  - renders under `PadPilotProvider`
  - exposes critical controls
  - updates visible state through public interactions
- Capability-backed analyzer UI:
  - subscribes through `PadPilot.analyzer.subscribe()` or `PadPilot.hooks.useAnalyzerFeed()`
  - verifies duplicate subscriptions do not emit duplicate native `openStream` intents
  - verifies auto-close on cleanup or module switch
  - verifies frozen last-frame behavior through the public cached frame API instead of protobuf internals

## Harness notes

- `createUiTest()` owns DOM cleanup and Happy DOM bootstrap.
- `ui/src/test-setup.ts` owns Bun preload setup, including `bun-plugin-solid`.
- Keep the helper minimal. Do not hide `render`, `screen`, `fireEvent`, or assertions behind custom wrappers.

## Layering rules

- UI tests belong under `apps/pad-pilot/ui/src`.
- Native or plugin-owned contract tests belong under `apps/pad-pilot/plugin`, not the UI tree.
- Source-contract assertions are only acceptable when the boundary itself is a serialized artifact or codec output, not a UI component.

## Verification

- Run `bun.cmd run --cwd apps/pad-pilot test:ui`.
- Run `bun.cmd run --cwd apps/pad-pilot test:ui:coverage` when touching multiple UI tests.
- Run `bun.cmd run --cwd apps/pad-pilot typecheck`.

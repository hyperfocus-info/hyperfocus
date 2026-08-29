# Test Scaffolding

PadPilot keeps tests next to the files they verify. Do not create separate `test` directories.

## Scope Rules

- `apps/pad-pilot/ui/src/**/*.test.ts[x]`: colocated UI, element, module, and bridge tests.
- `apps/pad-pilot-marketplace/src/**/*.test.ts`: colocated runtime and path-contract tests.
- `plugin`: favor native unit coverage around serialization, state mapping, and non-audio-thread helpers.

## Command Surface

- `bun run test`: root umbrella test command.
- `bun run test:fast`: cheap PR gate across UI, plugin contract tests, and marketplace tests.
- `bun run test:native`: native C++ behavior coverage for plugin runtime plus updater tests.
- `bun run test:acceptance`: repo-local acceptance coverage for marketplace HTTP and app-shell flows.
- `bun run test:plugin-contracts`: plugin and native contract tests that do not belong in `apps/pad-pilot/ui/src`.
- `bun run test:plugin-native`: native C++ behavior tests for plugin runtime helpers and protobuf boundaries.
- `bun run test:ui`: colocated UI tests via Bun.
- `bun run test:ui:coverage`: UI test coverage reporting via Bun.
- `bun run test:marketplace`: colocated marketplace tests via Bun.
- `bun run typecheck`: root TS typecheck.

## Marketplace Rules

- Tests must use temp SQLite paths and temp upload roots.
- Do not write into committed `apps/pad-pilot-marketplace/data`.
- Prefer `createMarketplaceApp({ db, env, services })` for app-level HTTP coverage instead of source-string route checks.
- Default-path tests must verify:
  - `apps/pad-pilot-marketplace/data/db/padpilot-dev.sqlite`
  - `apps/pad-pilot-marketplace/data/module-uploads`

## UI Rules

- Current state:
  - `apps/pad-pilot/ui/src` currently contains 31 test files.
  - UI behavior tests have been migrated off `Bun.file(...).text()` source-string assertions.
  - non-UI native contract coverage was moved out of `apps/pad-pilot/ui/src` into `apps/pad-pilot/plugin/runtime`.
- New goals:
  - Prefer behavior through public component APIs.
  - Use rendered DOM tests for UI components and elements.
  - Use pure input/output tests for logic helpers and state utilities.
  - Keep contract tests only at real public boundaries.
- Shared harness:
  - Use `createUiTest()` from `apps/pad-pilot/utils/tests/test-harness` through a direct relative import.
  - Keep `apps/pad-pilot/ui/src/test-setup.ts` as the Bun preload entrypoint.
  - `apps/pad-pilot/ui/src/test-setup.ts` is responsible for idempotent Happy DOM registration and loading `bun-plugin-solid`.
  - Run UI tests with browser conditions so Solid JSX, DOM APIs, and provider behavior match the app boundary.
  - Use `@solidjs/testing-library` for render, screen, and fireEvent-driven interaction tests.
- Vertical slice workflow:
  - Start with one tracer-bullet behavior.
  - Go red-green on one behavior at a time.
  - Do not bulk-write horizontal source-contract tests.
- Canonical tracer bullet:
  - `Tooltip` is the reference component for hover, focus, and cleanup-oriented UI testing.
- Default UI expectations:
  - cover initial render state
  - cover primary interaction flow
  - cover prop forwarding when relevant
  - cover accessibility roles and labels when relevant
  - cover close or cleanup behavior for modals, drawers, and tooltips
- Learnings from the migration:
  - `bun-plugin-solid` in the preload path is required for reliable Solid context, signals, and provider semantics under Bun test.
  - DOM-oriented UI tests should share one minimal harness instead of repeating cleanup and DOM bootstrap in every file.
  - provider, bridge, and runtime tests are stable only when they exercise public methods and emitted state, not source text.
  - cross-layer contract coverage is easier to reason about when it lives with the owning layer instead of under `apps/pad-pilot/ui/src`.
- Remaining gaps to improve:
  - deeper keyboard-path coverage in complex controls such as comboboxes, drawers, and module editors
  - broader accessibility assertions for labels, focus movement, and escape-key behavior
  - higher coverage on the largest FX surfaces where render branches are still wide
- Coverage target:
  - Aim for >85% coverage on touched UI files when practical.

## Native Rules

- Do not treat audio-thread work as safe unless explicitly proven.
- Prefer executable native behavior tests over source-string assertions when validating runtime, persistence, and protobuf helpers.
- Verification must keep the real-time guarantees intact:
  - no allocation in `processBlock`
  - no locks
  - no blocking I/O
  - no QuickJS execution on the audio thread

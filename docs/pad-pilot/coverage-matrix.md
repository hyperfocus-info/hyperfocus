# PadPilot Coverage Matrix

Maps every shipped story in [user-stories.md](user-stories.md) and
[marketplace-user-stories.md](marketplace-user-stories.md) to its boundary proof.

Depth: `unit`, `integration`, `native`, or `unit+integration+native`. Status:
`OK` means the automated boundary is covered; `HOST-GATE` adds a provisioned DAW
or validator requirement defined by [VST quality gates](vst-quality-gates.md).

## PadPilot app and Module framework

| Story ID | Covered by | Depth | Status |
| --- | --- | --- | --- |
| PP-NAV-001 | `ui/src/app.test.tsx`, `ui/src/app.acceptance.test.tsx` | integration | OK |
| PP-MODULE-001 | `ui/src/module-runtime.test.tsx`, `plugin/runtime/padpilot-native-tests-main.cpp` | unit+native | OK |
| PP-MODULE-002 | `ui/src/module-runtime.test.tsx`, `ui/src/dev-host/runtime.test.ts`, `plugin/runtime/padpilot-native-tests-main.cpp` | integration+native | OK |
| PP-MODULE-003 | `ui/src/module-runtime.test.tsx`, `plugin/runtime/realtime-correctness-contract.test.ts`, `plugin/runtime/padpilot-native-tests-main.cpp` | integration+native | OK |
| PP-PRESET-001 | `ui/src/padpilot/provider.test.tsx`, `plugin/runtime/padpilot-native-tests-main.cpp` | integration+native | OK |
| PP-INPUT-001 | `ui/src/components/controller-preferences-modal.test.tsx`, `plugin/runtime/controller-input-hardening.contract.test.ts` | integration+native | OK |
| PP-STATE-001 | `ui/src/padpilot/provider.test.tsx`, `plugin/runtime/realtime-correctness-contract.test.ts`, `plugin/runtime/padpilot-native-tests-main.cpp` | integration+native | HOST-GATE |
| PP-UPDATE-001 | `ui/src/state/marketplace-store.test.tsx`, `scripts/create-plugin-update.test.ts`, `scripts/deploy-ui.test.ts` | integration | OK |
| PP-ACCESS-001 | `ui/src/components/elements/*.test.tsx`, `ui/src/app.acceptance.test.tsx` | integration | OK |
| PP-AI-001 | `ui/src/padpilot/agent.test.ts`, Generator agent utility tests | unit+integration | OK |
| PP-FX-001 | `ui/src/modules/fx/fx-module.test.tsx`, `plugin/runtime/fx-native-contract.test.ts`, native tests | unit+integration+native | HOST-GATE |
| PP-RECUT-001 | `ui/src/modules/recut/recut-module.test.tsx`, `plugin/runtime/sample-capability-native-contract.test.ts`, native tests | unit+integration+native | HOST-GATE |
| PP-GENERATOR-001 | `ui/src/modules/generator/generator-module.test.tsx`, Generator utility tests | unit+integration | OK |
| PP-ANALYZER-001 | `ui/src/modules/analyzer/analyzer-module.test.tsx`, `plugin/runtime/analyzer-native-contract.test.ts` | integration+native | HOST-GATE |
| PP-EDITOR-001 | `ui/src/modules/editor/editor-module.test.tsx`, `ui/src/padpilot/producer-actions.test.ts` | integration | OK |
| PP-PERFORMANCE-001 | `ui/src/modules/performance/performance-module.test.tsx`, `ui/src/padpilot/producer-actions.test.ts` | integration | OK |
| PP-AUTHOR-001 | `packages/pad-pilot/src/module-manifest.test.ts`, `packages/pad-pilot/package-exports.test.ts` | unit+integration | OK |
| PP-AUTHOR-002 | `packages/pad-pilot/fixtures/module-consumer/verify.ts`, `packages/pad-pilot/module-consumer.test.ts`, `ui/src/padpilot/host-surface-contract.test.ts` | integration | OK |
| PP-AUTHOR-003 | capability tests under `ui/src/padpilot`, `plugin/runtime/realtime-correctness-contract.test.ts` | unit+native | OK |
| PP-AUTHOR-004 | `ui/src/padpilot/provider.test.tsx`, `plugin/runtime/module-state-migration.contract.test.ts` | integration+native | OK |
| PP-AUTHOR-005 | public capability tests under `ui/src/padpilot` | unit+integration | OK |
| PP-AUTHOR-006 | `ui/src/module-runtime.test.tsx`, factory Module tests, `plugin/runtime/padpilot-processor-tests-main.cpp`, native capability contracts | integration+native | OK |
| PP-AUTHOR-007 | `plugin/runtime/quick-js-safety-contract.test.ts`, `ui/src/module-runtime.test.tsx`, realtime contracts | integration+native | OK |
| PP-HOST-001 | realtime correctness contracts and `padpilot-native-tests` | native | HOST-GATE |
| PP-HOST-002 | `plugin/runtime/backend-log-contract.test.ts`, native tests | native | OK |

## Marketplace

| Story ID | Covered by | Depth | Status |
| --- | --- | --- | --- |
| PPM-CATALOG-001 | `ui/src/state/marketplace-store.test.tsx`, `apps/pad-pilot-marketplace/src/server.test.ts` | integration | OK |
| PPM-AUTH-001 | marketplace `session.test.ts`, `server.test.ts`, PadPilot marketplace-store tests | integration | OK |
| PPM-PUBLISH-001 | marketplace `server.test.ts`, `module-transfer.test.ts` | integration | OK |
| PPM-PURCHASE-001 | marketplace `stripe.test.ts`, `billing-webhooks.test.ts`, `server.test.ts` | integration | OK |
| PPM-ENTITLEMENT-001 | marketplace `billing-webhooks.test.ts`, `server.test.ts` | integration | OK |
| PPM-ACCOUNT-001 | marketplace `db.test.ts`, `billing-webhooks.test.ts` | integration | OK |
| PPM-RELEASE-001 | marketplace `db.test.ts`, PadPilot update and signing tests | integration | OK |
| PPM-RECOVERY-001 | marketplace `server.test.ts`, `codex-generator.test.ts`, module-transfer tests | integration | OK |
| PPM-SECURITY-001 | marketplace server, rate-limit, transfer, Stripe, session, and DB tests | integration | OK |

## Commands

Run `bun.cmd run test:pad-pilot`, `bun.cmd run test:pad-pilot-native`, and the
package gates in [Package Testing](../package-testing.md). Complete the external
host checks before release when a row is marked `HOST-GATE`.

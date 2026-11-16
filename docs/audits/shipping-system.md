# Shipping system assessment

Baseline: 2026-09-10, inspected in the current working tree, including substantial
pre-existing uncommitted work. This is an evidence snapshot, not certification of
all products. [Shipping](../shipping.md) owns the ongoing workflow; the
[repository TODO](../../TODO.md) owns cross-product follow-up work.

## Executable shape

The root Bun workspaces contain four applications and eight packages. Most code is
TypeScript; first-party UI uses Solid/StyleX. PadPilot also owns C++20, JUCE, CMake,
QuickJS and native VST3/standalone builds. Engine targets browsers, Bun/server use,
and WebAssembly. Host apps own SQLite and privileged runtime state.

Root `package.json` fans out lint, typechecks, tests, builds, and boundary policies.
Product-specific gates remain necessary: engine package/consumer and WASM checks,
Harness launcher extraction, and PadPilot native validators plus a self-hosted
FL Studio runner. `spikes/solid-2` and engine examples preserve cheaper experimentation.
No universal deployment configuration or package generator was found; engine
project creation and PadPilot protocol/factory generation have concrete local owners.

The scan covered root and nested instructions, workspace manifests/READMEs, CI,
release scripts, root skills, documentation routes, representative production
boundaries, TODOs, and failure-path tests. It was not a line-by-line audit of every
implementation or a live product campaign.

## Repeated patterns

| Classification | Evidence and decision |
| --- | --- |
| Already appropriately shared | `packages/desktop-runtime` owns hidden process/browser lifecycle; `packages/ui` owns presentation; `ai-core`, `workspace`, and `pad-pilot` own portable contracts. Reuse these boundaries. |
| Repeated and deserving extraction | No new shared product primitive met the evidence threshold. Release command discovery warranted composition of existing commands, not another runtime framework. |
| Repeated but intentionally project-specific | SQLite authority, credentials, native host compatibility, module/game rules, and packaging formats belong to their hosts. |
| Premature to generalize | A universal deployment/environment/telemetry layer, example gameplay infrastructure, and browser persistence adapters lack demonstrated common consumers. |
| Legacy / inconsistent | Hand-maintained version coverage missed `ai-runtime` and `performance`; editor release archive omits its startup imports; local editor test discovery excludes root tests. |
| Needs validation rather than abstraction | Actual archive/package startup, public import closure, production config, browser viewport behavior, and CI gate coverage. |

## Evidence-backed gaps

1. **Editor artifact completeness.** The release workflow hand-lists files for
   `hyperfocus-editor-windows-portable.zip`. It includes `cli.ts`, whose immediate
   import is `editor-cli.ts`, but omits that file. Included `server.ts` also imports
   omitted local modules and workspace packages. `apps/engine-editor/build.ts`
   builds browser assets, not a standalone server distribution. An extracted
   startup and create/save/reload journey is required before claiming portability.
   The npm `files` list similarly needs an actual installed-consumer check.
   This run restricts the unverified ZIP to CI candidate storage and removes it
   from automatic GitHub release publication until that evidence exists.
2. **Source validation and release validation differ.** Before this run,
   `check:release-readiness` only checked versions/layout, and release CI omitted
   editor and engine tests. The new gate makes its automated scope explicit;
   it does not replace missing artifact acceptance. Editor-local `test` still
   targets `src`; root `test:editor` includes CLI/server tests too.
3. **Marketplace deployment is checkout-shaped.**
   `apps/pad-pilot-marketplace/src/env.ts` derives sibling PadPilot assets and local
   migration paths. Its manifest has source startup, tests, and typecheck but no
   deployment artifact or rollback command. Independent deployment needs an
   explicit runtime layout, environment contract, migration/recovery drill, and
   target owner. A production build is not inherently required for a Bun service.
4. **Certification claims exceed wired evidence.** Engine
   `docs/production-readiness.md` refers to a publish workflow absent from
   `.github/workflows`; `release-todo.md` still lists publishing setup as future
   work. Browser certification asks for WebKit, but
   `scripts/browser-device-matrix.test.ts` exercises Chromium and Firefox.
   Keep missing coverage visible instead of inferring it from another browser.
5. **Some UI assertions are structural.** Editor responsive tests inspect source
   and CSS strings. Real browser journeys exist in `verify-system.ts`; those are
   the better route for viewport, focus, overflow, and recovery acceptance.
6. **Public release prerequisites are unfinished.**
   [Licensing](../licensing.md) records unresolved licensor/reporting details.
   Native host checks and release signing remain product-owned prerequisites.

## Existing adversarial coverage to preserve

Marketplace tests already exercise fragmented uploads, chunk floods, symlinks,
same-size tampering, response lifetime, duplicated/out-of-order webhooks, rollback,
and refunds. Editor/engine contain seeded history and boundary tests; UI contains
large transcript tests. Harness already extracts and exercises its launcher before
upload. PadPilot validates an exact native candidate through plugin validators and
a real DAW runner. These are stronger foundations than new generic checklists.

## Improvements made from this evidence

- Discover versioned manifests from declared root workspaces so newly added
  packages cannot silently escape the version policy or patch bump.
- Compose product checks through `ship-check`, with dry-run plans, explicit
  failure/skipped results, machine-readable output, and remaining acceptance.
- Route release preparation through one focused skill and keep EXPLORE cheap.
- Require demonstrated consumers or recurring costs before shared extraction;
  preserve repeated lessons in validators and regressions before adding prose.
- Validate shipping command/documentation routes and connect repository policies
  to pull requests and release candidates.

Do not turn these findings into a universal project scaffold. First close one
real delivery path, observe where work repeats, and evolve only that proven part.

## Repository gate follow-up (2026-09-10)

The follow-up closes the missing exact PP-EVAL-002 coverage row using existing
dashboard/API evidence and repairs an external-Module test fixture missing
`files.exportJson`. Existing selection controls, AI actions, sandbox code,
installation UI and Presets now have cohesive directories. Controller/input
reconciliation moved out of the oversized provider; identical failure diagnostics
now share one owner across the assistant and background-job panels. Orchestrator
prompt formatting has its own module, and oversized tests reuse existing fixtures.
Baselines only decreased. Untracked disposable root build output is ignored.

Process stream types now infer default stdout/stderr pipes correctly. Byte-array
input exposes no writable sink after the adapter sends and closes it. Runtime and
compile-time regressions cover this boundary without type assertions. Recut UI
tests now install and restore the existing audio fixture instead of depending on
fake decoding in production. The HMR clock test injects asset compilation so a
real build cannot consume its timing budget or contaminate the next singleton test;
separate UI-build integration tests still exercise the real bundler.

Validation: repository tests 135/135; shared-package, Harness and PadPilot
typechecks; 56 shared UI tests; 23 process/browser/Windows lifecycle tests;
18 evaluator dashboard/API tests; production PadPilot UI build; and process policy
passed. All 115 PadPilot UI files passed across the full run plus the repaired
Recut-and-later rerun. The broad Harness run passed core (724) and UI (654) tests;
its two HMR failures passed in the repaired startup shard (8/8). Backend tests use
the existing `HARNESS_TEST_SKIP_UI_PRELOAD=1` lane in the package test runner.

Harness, PadPilot, shared UI, and shared process policy findings from this pass
are closed. Ongoing editor/engine changes still need their scoped boundary and
type-model repairs before the repository-wide gate is green. Rerun
`check:source-structure` and `check:code-style` for the current findings; this
assessment is not an allowlist or a waiver of those checks.

## Artifact and deployment follow-up (2026-09-10)

The earlier editor packaging, marketplace layout, and license-contact findings
above are historical. Editor distribution now bundles its runtime dependencies,
preserves upstream notices, and verifies both a portable archive and a freshly
installed npm package outside the checkout. The full editor profile passed 423
tests, typechecking, browser boot, project/asset save-reload, stale-write rejection,
and custom source compilation. Release CI publishes only the verified archive.

Marketplace production now has a root Railway configuration, Dockerfile, explicit
artifact/data layout, required production configuration, runtime migrations,
health readiness, and shutdown handling. Its full profile passed 80 tests, commerce
acceptance, isolated artifact startup, anonymous-mutation rejection, missing-asset
readiness failure, and cold SQLite/upload restore. Notices follow the actual server
and browser bundle inputs. Independent review caught and corrected app-directory
metadata path resolution. Runtime environment preservation is explicit because an
initial bundled smoke exposed build-time NODE_ENV substitution.

The owner designated Hyperfocus LLC and payment@hyperfocus.info; the appropriate
license copies now contain those values without changing the distinct product
license terms. No package, release, Git commit, or deployment was published here.

The final repository-tool suite passed 136 tests. Product profile success remains
separate from the known editor/engine broad source/style violations.
The shared-package profile also passed all types, builds, and 282 tests. The broad
policy snapshot retains 11 source-structure failures across editor/engine and 51
editor style findings. The engine shipping gate separately fails its bundle budgets
(2,572,850 aggregate bytes against 1,600,000); installed-consumer and browser success
do not waive that failure. No budgets or policy baselines were increased.
Repository policy now also runs on main pushes, and tagged release jobs enforce
source/style gates before publication; known policy failures remain blocking there.
Engine targeted verification passed 455 tests, all five typecheck lanes, installed
Bundler/NodeNext consumers, and six Chromium/Firefox/WebKit desktop/touch profiles.
Windows monitoring observed no visible windows. These results do not change the
failed budget gate or supply the external evidence required by `certify:package`.

External deployment acceptance remains open: Docker is unavailable locally; the
new Linux image workflow has not run remotely. DNS resolves the target to Railway,
but the live `/healthz` returned 404 before deployment. The connected service still
needs verified `/data` persistence, production Clerk/Stripe credentials and flows,
trusted ingress client-IP isolation, and a real Railway snapshot restore. Follow
the [deployment guide](../../apps/pad-pilot-marketplace/deployment.md). These checks
cannot be replaced by the passing local provider fixtures.

## Final-mile validation follow-up (2026-09-10)

The source/style findings above are now repaired through scoped editor and engine
modules, typed test fixtures, and real persisted-value validation. Source baselines
only decreased. Editor typechecking now includes its tests; the previous config
excluded them. Its UI runner uses browser conditions so Solid lifecycle hooks and
reactivity execute. That exposed a previously inert cancellation test and now
checks both cancellation and invalid-input recovery. Canonical scene/timeline
readers validate unknown persisted data while preserving the original object used
by in-progress edits. Regression cases reject malformed nested rendering values
and missing IK bend directions.

Delivered editor candidates now exercise Diagnostics fallback and Motion preview
in addition to project/asset persistence and source compilation. The broader
system journey exposed a real narrow-layout failure: entering Play from Inspector
left the runtime canvas hidden and unable to receive keyboard focus. Play now
reveals the primary workspace before focusing its canvas. The browser journeys
pass 15 product checks and 12 system checks, including native keyboard movement
after editing the actor transform. Verification output lives under
`.local/editor-verification/`; corrected verifier paths follow the actual
`packages/engine` workspace.
Both browser suites now run inside `ship-check editor` and before artifact
publication in release CI; regression tests prove a failed journey stops artifact
checks. The integrated editor gate passed all 436 tests and both delivered forms.

A repeated broad run exposed another test-isolation failure: real UI compilation
used nearly all of a five-second Harness startup-test deadline, then pending work
contaminated rollback verification. HMR lifecycle cases now inject the existing
asset-service factory and assert initialization/refresh behavior. Both startup
shards passed three consecutive 17-test runs without bundling; dedicated UI-build
tests retain real compilation coverage. The Harness skill records this boundary.
Two native contract tests also now read the actual extracted dev-host owners;
all 39 native contract checks pass without changing native implementation.

Bundle diagnosis found retained physics and motion features had outgrown old
feature limits. Shared splitting reduced archive bytes but increased some native
consumer graphs, so it was rejected. Removing unused Meshopt encoder/decoder code
produced a net 33,695-byte distribution reduction: 2,547,872 raw bytes versus the
2,581,567-byte control. The old 1.6 MB aggregate limit was **not** met: approved,
documented feature limits now cover the current retained feature set. The gate
counts every output, native import graph, and rebundled consumer, with raw, gzip,
and Brotli limits. See the engine's [bundle-size evidence](../../packages/engine/docs/bundle-size-evidence.md)
for measured ceilings, owners, and reduction targets. This budget migration is
distinct from optimization.

The missing Kenney source-regeneration inputs were recovered from the official
CC0 release and checked against pinned archive/source/license hashes. A local
restoration command verifies all five generated GLBs and the manifest before
restoring ignored authoring inputs; it preserves differing local files. The five
fixture regressions now pass without a skip. External package certification still
requires the evidence listed in the engine release TODO.

The marketplace now exposes the validated Railway commit SHA in health readiness.
`bun run --cwd apps/pad-pilot-marketplace verify:deployed --revision <full-Git-SHA>`
checks the public health identity, HTML, assets, and anonymous bootstrap using
bounded, credential-free GET requests. Wrong revisions, failed/empty responses,
wrong MIME types, HTML asset fallbacks, incompatible bootstrap data, and oversized
streams fail. Local artifact smoke exercises the same verifier.
The browser and checker share the portable bootstrap schema and two-MiB response
limit through `@hyperfocus/pad-pilot/marketplace-schema`; bounded stream reading
also reuses the existing public helper. Nine deployed-check regressions pass.
It establishes public startup only; real identity, billing, ingress, and restore
acceptance remain separate.

Current external blockers: GitHub CLI authentication is unavailable, a remote
main ref could not be read, no Docker/Linux runtime is installed, and live
`https://padpilot.hyperfocus.info/healthz` returns HTTP 404. No commit, push,
publication, or deployment was performed. Railway is already connected to GitHub
according to the owner; do not ask for a service name or tokens again. Complete
remote Linux CI and the deployment guide's production acceptance against the
actual committed revision when access is available.

Final local validation: `bun run check` completed with exit 0 on Windows x64 / Bun
1.4.2, including repository policies, lint, all typecheck/test lanes, and all root
builds. It includes 148 repository-tool tests, 436 editor tests, 654 Harness UI
tests, 1,278 engine core tests, and 623 PadPilot UI tests across 116 isolated files.
The separate engine and expanded editor shipping profiles passed; marketplace
commerce, production artifact, and cold-volume recovery acceptance passed. Lint
retains 85 existing warnings and no errors; ratcheted policy exceptions remain
visible. Logs are `.local/shipping-system/check-pass.log`,
`.local/editor-final-integrated-ship.log`, and `.local/engine-release/ship-next.log`.
The final deployed check still fails with `/healthz: HTTP 404`; local success does
not supply deployment or publication evidence.

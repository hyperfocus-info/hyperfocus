# Delivered JavaScript size evidence

Owner: engine package maintainers. Build the package, then run
`bun run check:bundle-size` from `packages/engine`. The executable ceilings
live in [the budget policy](../scripts/bundle-size/policy.ts). The generated
`.local/engine-release/bundle-sizes.json` at the repository root records the
current result; older measurements are [archived separately](history/bundle-size-evidence.md).

## Measurement contract

`project/metadata` is a new validation-only public surface with a 1,600-byte raw,
650-byte gzip and 550-byte Brotli ceiling. Its implementation has no runtime
factory dependency. Regression builds check selected 2D consumers and keep
replay file codecs behind dynamic imports. Installed authoring tools include
dimension-specific entries as well as the compatible universal entry; complete
delivered graphs remain subject to the existing distribution ceilings.

The new `project/delivery` entry has a 240,000-byte native graph ceiling (73,000
gzip / 63,500 Brotli). Its October 17 measurement is 226,563 / 70,403 / 60,990;
the rebundled consumer is 102,533 / 32,742 / 28,480. The graph includes the shared
project container. This adds a budget for the new public surface; existing entry
and aggregate ceilings remain unchanged. Current package-wide overages still
block release acceptance and are recorded in the generated report.

The gate checks every public JavaScript entry, its complete native dependency
graph, and a rebundled consumer. It also measures every delivered JavaScript
artifact in the runtime, browser, authoring-tool and total distributions using
raw, gzip and Brotli bytes. Minimal canvas and browser-app consumers have their
own compressed limits. External Three.js, the esbuild host tool and WASM assets
are outside this JavaScript measurement and must not be described as free.

Shared chunks count in every graph that loads them. A smaller entry file or
aggregate alone does not prove an improvement: the actual consumer's complete
native and rebundled graphs must improve. Do not move dependencies outside the
measurement or drop supported features. Ceiling increases require an explicit
owner decision, measured scope and a removal/review condition; the authorized
temporary exception below is the current decision.

For a size repair, preserve a control and candidate report under the nearest
`.local/`, identify the owning dependencies and real consumer, then run the
installed-package smoke test. Include behavioral verification for any changed
runtime boundary. Build or browser success does not waive size acceptance.

## Operational input boundary repair (October 27)

Combat replay, rollback and spectator paths now import their operational input
validator directly from its canonical owner. The public combat-net entry retains
its complete schemas, codecs and structural readers. Runtime-only consumers no
longer initialize that unrelated schema graph; public exports and validation
behavior remain compatible.

Fresh normal control/candidate builds include the preceding typing repairs.
Runtime changes from 3,710,082 / 1,197,245 / 1,012,260 to
3,707,759 / 1,196,580 / 1,011,804 raw/gzip/Brotli bytes. Total delivered JavaScript
changes from 6,941,830 / 2,205,984 / 1,859,119 to
6,939,565 / 2,205,071 / 1,858,651. All 102 outputs and shared chunks are counted.
Combat-net's compressed native graph grows 15 gzip / 24 Brotli bytes, while both
complete compressed aggregates improve. Tooling raw size grows 58 bytes.

Both builds and actual installed consumers pass, including Bun/Node lease and
evidence admission and strict nominal declarations. Eighty-six focused tests and
312 emitted-validator cases retain wire/validation/error behavior; eight getter
traces retain access order. The actual installed narrow project-reader graph falls
from 43,866 to 41,595 raw bytes. This is dependency ownership evidence, not a CPU
or latency claim.

The complete gate still reports **93 failing dimensions**, none added or resolved.
Runtime remains 142,748 raw / 64,004 gzip / 55,399 Brotli bytes over its fixed
ceilings. No budget, feature, camera or approved visual changed. Builds and
consumer compatibility do not establish size or release acceptance.

### Rejected physics export sharing

A disposable ragdoll-factory intersection probe preserved all normal package
outputs. Its counted shared chunk reduced aggregate distribution bytes, but the
runtime, physical-performance and ragdoll consumers each grew in every complete
native and rebundled dimension. Native runtime grew 25,495 raw / 10,781 gzip /
10,383 Brotli bytes, and four previously passing raw graph checks failed. Splitting
the factory duplicated transitive numeric/helper work and changed private scratch
ownership; observed WASM module and instance creation rose from four to five.

Both 142-test artifact runs and frozen behavior comparisons passed, which did not
override the delivery regressions. The candidate was rejected without production
edits. All 102 normal output hashes and protected source/visual records remained
unchanged. Do not repeat this packaging boundary based on aggregate savings alone.

### Deferred delivered reader facade

A disposable public facade/private implementation boundary reduced the installed
project-reader fixture from 41,595 / 15,142 / 12,607 to 1,973 / 913 / 787
raw/gzip/Brotli bytes. It increased complete native runtime by 2,355 / 1,494 /
1,390 and the fresh full rebundle by 24 / 112 / 22. Native initialization/fallback
and finite behavior checks passed, with three additional loader module records;
loader memory and latency were not measured.

No production consumer benefit was established. The existing standalone worker
uses nine readers and the runtime/gameplay factories, retaining the implementation
branch. The isolated fixture gain does not justify the full-graph regression.
Production integration was deferred before edits or gates, leaving selected R18
outputs and all 93 failures unchanged. Reconsider only with a named real consumer
and complete delivery evidence, not the synthetic import-size result alone.

## October 26 notice deduplication

Simulation-math headers now separate common Apache text and repeated upstream
notices so the bundler retains each distinct legal comment once. All copyright,
provenance and complete license text remain; arithmetic output is unchanged.
The package bundler has an independent notice-retention/deduplication test.

The full runtime distribution changed from 3,713,824 to 3,661,609 raw bytes and
1,184,449 to 1,183,684 gzip bytes. Brotli changed from 1,001,015 to 1,001,037
bytes, a 22-byte increase. Combat's complete native graph changed from 97,208
to 90,684 raw bytes. No supported feature, public entry or ceiling changed.
Build and packed-consumer acceptance pass; the full size gate still fails on
the existing per-entry and runtime-distribution ceilings. This is a bounded size
repair, not a runtime speed improvement or release acceptance.

## Temporary budget exception (2026-10-07)

The repository owner explicitly authorized accepting current bundle sizes and
deferring optimization to long-term investigation. Engine maintainers own this
exception; editor standalone owners share responsibility for authoring output.
Existing public imports and synchronous gameplay APIs remain compatible.

The initial exception raised exceeded limits to current measurements. The owner
then explicitly requested **2x budgets**, with reduction deferred, for the failing
standalone output and its tooling/total aggregates. Those three ceilings now have
2x their initial exception in every raw/gzip/Brotli dimension (table below).
Other entry, runtime, browser and minimal-consumer limits remain unchanged. This is acceptance
of existing size debt, not a performance improvement or general release approval.
The checker still rejects growth beyond these fixed limits; it does not refresh
them automatically.

Review before the next engine release and when changing affected boundaries.
[Long-term investigation tasks](release-todo.md#long-term-bundle-size-investigation)
own attribution, optional modules, compatibility and ratcheting. Retire increases
as verified reductions restore the previous targets below; retaining an increase
requires another explicit decision. Raw control evidence is preserved at
`.local/engine-release/budget-exception-2026-10-07-before.json`.

Previous and temporary limits in bytes (raw / gzip / Brotli):

| Entry or aggregate | Previous target | Temporary limit |
| --- | ---: | ---: |
| `dist/tooling/create-project.js` | 602,000 / 186,000 / 153,000 | 738,477 / 229,085 / 187,805 |
| `dist/tooling/build-project.js` | 604,000 / 186,000 / 153,000 | 740,309 / 229,177 / 188,027 |
| `dist/tooling/dev-project.js` | 612,000 / 190,000 / 157,000 | 747,875 / 232,674 / 191,115 |
| `dist/tooling/standalone-runtime.js` | 900,000 / 274,000 / 224,000 | 4,495,464 / 1,412,924 / 1,131,902 |
| `dist/server.js` | 200,000 / 90,000 / 80,000 | 210,016 / 90,000 / 80,000 |
| `dist/render-3d-scene.js` | 33,000 / 10,600 / 9,200 | 37,563 / 12,291 / 10,697 |
| `dist/render-3d-webgl2.js` | 43,000 / 11,900 / 10,500 | 49,955 / 14,209 / 12,509 |
| `dist/physics-3d.js` | 24,000 / 10,800 / 9,600 | 54,051 / 17,391 / 14,490 |
| `dist/physics-rigid-3d.js` | 77,000 / 26,200 / 21,800 | 115,042 / 38,526 / 31,764 |
| `dist/physics-ragdoll-3d.js` | 75,000 / 22,900 / 19,800 | 104,639 / 32,065 / 27,188 |
| `dist/physics-physical-performance-3d.js` | 257,000 / 78,800 / 64,900 | 292,268 / 90,369 / 74,349 |
| `dist/motion.js` | 172,000 / 55,100 / 46,700 | 201,034 / 64,108 / 53,823 |
| `dist/motion-three.js` | 129,000 / 41,300 / 34,800 | 158,136 / 50,173 / 42,053 |
| `dist/project.js` | 70,000 / 21,400 / 18,800 | 145,405 / 43,488 / 37,478 |
| `dist/project-runtime-timeline-2d.js` | 18,000 / 5,600 / 4,900 | 18,319 / 5,771 / 5,109 |
| `dist/project-runtime-3d.js` | 605,000 / 187,000 / 153,000 | 1,086,376 / 347,897 / 282,333 |
| `dist/combat.js` | 25,500 / 8,000 / 7,300 | 96,561 / 22,909 / 19,126 |
| `dist/combat-net.js` | 11,500 / 5,175 / 4,600 | 14,888 / 5,175 / 4,600 |
| `dist/audio.js` | 28,000 / 12,600 / 11,200 | 56,293 / 19,326 / 17,050 |
| `dist/effects.js` | 24,000 / 10,800 / 9,600 | 29,993 / 10,884 / 9,704 |
| `runtimeDistributionBudget` | 2,602,000 / 824,000 / 704,000 | 3,565,011 / 1,132,576 / 956,405 |
| `toolingDistributionBudget` | 1,484,000 / 457,000 / 374,000 | 6,024,172 / 1,892,198 / 1,526,244 |
| `totalDistributionBudget` | 4,086,000 / 1,281,000 / 1,078,000 | 13,154,194 / 4,157,350 / 3,439,054 |

## Owner-approved measured budget integration (2026-11-16)

The repository owner answered **"Approve the measured budget patch"** to the
question naming `.local/harness-push/budget-approval-policy.patch`. The exact
approved patch SHA-256 is
`44b11d08485908661973a198212aa8014fa9813b2c1278177769179dfb3bed76`.
The original measured source tree was
`421ae7cea97092f52a6252198753972de51347ef`; integration starts from independently
reviewed tree `c9042925583f326fec6cbdc66557b8da11ade442`.

This decision accepts 44 exceeded dimensions across 19 groups: retained core,
scene/WebGL, physics/ragdoll/physical-performance, motion, project/delivery/runtime,
navigation, combat, audio/effects and the runtime aggregate. The original exact
fixed ceilings are applied without extra margin. All other dimensions and consumer
limits stay fixed. This accepts measured size debt, not optimization or release.

Comparison against final v5 measurements found 181 equal policy dimensions and
two higher requested dimensions: runtime gzip 1,168,117 versus approved 1,168,114,
and runtime Brotli 981,760 versus approved 981,755. Those extra 3 and 5 bytes are
**not approved** and are not applied. Complete native/rebundled graph accounting
and every gate remain enforced; remaining failures prevent size acceptance.

Engine maintainers own this exception; Editor owners join authoring changes.
Review before the next Engine release and whenever affected boundaries change.
Retire each increase when compatible measured reductions restore its previous
limit; retaining an increase at review requires another explicit owner decision.
Preserve public APIs, synchronous behavior and save/project wire formats. Source,
build, measurement or toolchain drift requires fresh measurement; this decision
does not authorize automatic ceiling refresh, push or publication.

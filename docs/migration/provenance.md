# Import provenance

The harness snapshot came from `C:\Users\MindOverMelee\ai-harness-template` at commit `2828779fbb5d5f606f768cf22ab7b2fbe872ad57`, including its uncommitted and untracked work as present on 2026-08-22. Its original remote was `https://github.com/TheBlueSpot/ai-harness-template.git`.

The engine snapshot came from `C:\Users\MindOverMelee\Desktop\context\engine`, which was not a Git repository.

The engine's `examples/**/assets/source` directories were excluded. They contained about 4.36 GB of licensed source packs, including files above GitHub's 100 MB limit. Runtime-ready `assets/usable` content and attribution files remain in the monorepo. Restore source packs from their licensed upstream downloads when asset recooking is required; do not commit them to ordinary Git history.

The source directories were copied, not moved or modified.

The PadPilot snapshot came from `C:\Users\MindOverMelee\pad-pilot` at commit
`d10dae4` on 2026-08-29. All local source work was committed before import. The
target Hyperfocus baseline was commit `97f7934`. Git metadata, dependencies, build
output, local databases, caches, secrets, and temporary state were excluded. Source
was copied, not moved; the original repository remains a recoverable archive.

Imported ownership was normalized as follows: native host/UI/scripts to
`apps/pad-pilot`, service code/migrations to `apps/pad-pilot-marketplace`, portable
contracts/utilities to `packages/pad-pilot`, and product docs to `docs/pad-pilot`.

PadPilot source used `MindOverMelee Source-Available License 1.0`, while the
pre-existing Hyperfocus repository uses `Hyperfocus Source-Available Game License
2.0`. The import preserves PadPilot's license in both PadPilot apps and the extracted
package. No relicensing decision is implied by the monorepo merge.

# TypeScript and build

For language, type modeling and naming, use
[repository code style](../../../../docs/code-style.md); this reference owns
Harness-specific build boundaries.

Use Bun TypeScript for repository automation. Process creation goes through
`@hyperfocus/desktop-runtime/process` and owned headless browsers through
`/automation`; raw spawn convenience must not bypass the
[hidden process contract](../../../../docs/development.md#process-and-browser-lifecycle).

Build with `bun run build:harness` when changing production bundling, deployment
wiring, asset serving, or compiler behavior. Focused tests/typechecking cover
ordinary edits without a production build.

Server reuse, rollback, and HMR scheduling tests inject `uiAssetManagerFactory`
and assert lifecycle calls. Real bundling exceeded the startup shard deadline
and leaked pending startup into rollback tests; increasing timeouts does not
isolate those responsibilities. Compilation/watcher coverage belongs in
`apps/harness/cli/src/ui-build.test.ts` and production build verification.
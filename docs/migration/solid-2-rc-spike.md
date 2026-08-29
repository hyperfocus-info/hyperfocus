# Solid 2 RC migration spike

Status: evidence spike, 2026-08-25. This document specifies the work required to
migrate Hyperfocus; it does not authorize a production dependency upgrade.

## Version decision

- Use `solid-js@2.0.0-rc.2`, `@solidjs/web@2.0.0-rc.2`, and
  `babel-preset-solid@2.0.0-rc.2` together. Solid 2 splits its DOM runtime and JSX
  types into `@solidjs/web`.
- Do not migrate TypeScript to the `rc` tag. The registry's current `rc` is
  `7.0.1-rc`, while this repository already uses released `7.0.2` in the editor.
  Root and harness are still on 6.0.3, so the useful TypeScript task is alignment
  on released 7.0.2, not a downgrade to an older prerelease.

## Required mechanical changes

1. Add `@solidjs/web` beside `solid-js` in both applications and `@hyperfocus/ui`.
   Change the UI package's peer contract to require both RC packages.
2. Change every `solid-js/web` import to `@solidjs/web`; change every
   `solid-js/store` import to `solid-js`. Remove the harness test resolver and
   declaration for `solid-js/web/dist/web.js`, replacing them with the public
   `@solidjs/web` entry point.
3. Change `jsxImportSource` and every `@jsxImportSource` pragma from `solid-js` to
   `@solidjs/web`. Update build externals from `solid-js/*` to explicit
   `solid-js` and `@solidjs/web` entries.
4. Upgrade `babel-preset-solid` to the matching 2.0 RC. Validate or replace
   `@dschz/bun-plugin-solid`, whose published peer range only declares the Solid 1
   preset. Bun 1.3.14's direct test-time TSX transform currently requests
   `jsxDEV` from `@solidjs/web`, which RC.2 does not export; UI tests must run
   through the matching Babel preset or wait for a compatible Bun transform.
5. Replace `splitProps` with `omit`, `unwrap` with `snapshot`, `onMount` with
   `onSettled`, and `classList` with Solid 2's object/array `class` form.

The current source inventory contains 34 files mentioning `createEffect`, 17
mentioning `onMount`, 31 mentioning `onCleanup`, 50 mentioning `createSignal`, 32
mentioning `createMemo`, six mentioning `createStore`, 51 mentioning `For`, and 69
mentioning `Show`. These are file counts, not blind replacement counts: each site
still needs semantic classification.

## Required semantic changes

1. Rewrite every one-argument `createEffect` and `createRenderEffect` into a
   tracked compute callback plus an untracked apply callback. Return cleanup from
   the apply callback. Component setup/teardown belongs in `onSettled`; retain
   `onCleanup` only where cleanup is tied to a reactive computation.
2. Audit every signal/store write followed by an immediate read. Solid 2 commits
   writes at the microtask boundary; imperative code and tests that require the
   new value synchronously must call `flush()`.
3. Rewrite store path setters and `reconcile` calls to draft-first setters. Remove
   `produce` wrappers because mutation is now the default. Treat `undefined` as an
   actual assigned value. Serialization and plain-object assertions use
   `snapshot`.
4. Audit all `<For>` children. Identity-keyed lists keep a value item and accessor
   index; non-keyed lists use `keyed={false}` with an accessor item and numeric
   index. The single `<Index>` occurrence must become non-keyed `<For>` if it is a
   real Solid component rather than an unrelated symbol.
5. Audit function children of `<Show>` and `<Match>` because narrowed values are
   accessors. Audit component call sites that pass accessors as props; Solid 2
   expects values at the JSX boundary.
6. Move writes currently performed in component bodies, memos, or effect compute
   phases into event handlers, `onSettled`, or a narrowly justified untracked
   block. Solid 2 development mode rejects owned writes.

## Ecosystem blockers

As of the spike date, the current published peer ranges for `@tanstack/solid-virtual`,
`@thisbeyond/solid-dnd`, `lucide-solid`, and `solid-markdown` only admit Solid 1.
They require RC-compatible releases, replacement, or verified temporary peer
overrides. `@solidjs/testing-library` accepts `>=1`, but its `next` line should be
tested because the stable line predates Solid 2. `@tanstack/solid-hotkeys` accepts
`>=1.7` but still needs runtime coverage.

## Verification gate

Run the isolated spike tests first. Then migrate in this order: compiler/import
surface, shared UI primitives, harness, editor, and ecosystem integrations. At
each stage run focused UI tests and typechecking. Before merging, require the full
package, harness, and editor tests plus both production UI builds and browser
smokes at desktop and narrow widths. Do not claim the performance benefit until
the existing build/runtime paths are benchmarked before and after with identical
inputs.

Run Bun tests with the browser export condition. Without it, Bun resolves the
server builds of both RC packages, so effects are inert and client rendering throws:

```powershell
bun.cmd test --conditions=browser
```

## Evidence fixture

[`../../spikes/solid-2/solid-2-rc.test.tsx`](../../spikes/solid-2/solid-2-rc.test.tsx)
locks down batching, split effects, the new DOM package, keyed list shape, and
settled cleanup. `migration-inventory.test.ts` keeps the risky source categories
machine-discoverable while the migration proceeds.

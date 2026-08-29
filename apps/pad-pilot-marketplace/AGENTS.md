# PadPilot marketplace directives

Scope: `apps/pad-pilot-marketplace`. Repository-level `AGENTS.md` also applies.
Default to `/caveman ultra` for user updates.

## Ownership

- This app owns PadPilot marketplace HTTP routing, auth, billing, SQLite,
  uploads, catalog, entitlements, and plugin/update delivery.
- `apps/pad-pilot` owns the VST3/standalone host and embedded UI.
- `packages/pad-pilot` owns portable public schemas, identities, bounds, SemVer,
  signing contracts, and stream/file helpers. Import only manifest exports.
- Keep deployment credentials, database handles, and filesystem authority out of
  shared packages and the plugin UI.

Use PadPilot's canonical terms: a **Module** is a user-installable TypeScript
capability layer; a **Preset** is saved mapping state inside a Module.

## Security and persistence

- Authenticate and rate-limit before expensive remote or filesystem work.
- Bound request bodies, response streams, multipart chunks, file counts, path
  depth, and generated process output before buffering.
- Reject traversal, links, non-regular files, cross-origin cookie mutations, and
  unverified download handles.
- Treat migrations as immutable ordered history with checksums; fail closed on
  schema drift.
- Make billing/webhook effects idempotent and transactionally atomic across event
  markers, entitlements, credits, refunds, and cleanup records.
- Never log credentials, payment secrets, session tokens, or raw signed payloads.
- Keep environment defaults rooted in this app; never write runtime data into the
  repository. Local data belongs under ignored `apps/pad-pilot-marketplace/data`.

## Workflow

- Use Bun and TypeScript for maintained scripts and runtime code.
- Keep tests beside their owners under `src`.
- After changes, run `bun run typecheck` and the narrow affected test first, then
  `bun test ./src`.
- Changes to portable marketplace schemas or limits require package tests and all
  affected plugin consumers in the same change.

This app and its distributed files retain the nested
`MindOverMelee Source-Available License 1.0`; do not silently relicense them under
the Hyperfocus root license.

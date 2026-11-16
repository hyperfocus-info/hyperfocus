# Special managed surfaces

Use `bun .agents/skills/dev-server/scripts/dev.ts start <surface> --json`.
Read the owning README when configuring that surface.

| Surface | Configuration and owner |
| --- | --- |
| `editor` | Website authoring is at `/website/builder`. For extracted-editor acceptance, set `ENGINE_EDITOR_ARTIFACT_DIR` to the directory containing `cli.js`, then start with `--isolated`; retain and stop the returned server ID. |
| `pad-pilot-marketplace` | Alias for the `pad-pilot` runtime. |
| `site-preview` | Extracted website acceptance: `SITE_BUILDER_ARTIFACT_DIR` and `SITE_DATA_DIR` point to owned fixture paths. |
| `books` | Books website example. Build its client first; `BOOKS_ARTIFACT_DIR` selects an extracted server.js artifact. Local verification uses SQLite without production Clerk credentials; `BOOKS_SQLITE_PATH` selects disposable state. |
| `trade-bot` | [Trade Bot example](../../../../apps/engine-editor/website/examples/trade-bot/README.md). Build its client first; `TRADE_ARTIFACT_DIR` selects an extracted artifact and `TRADE_DATABASE_PATH` selects SQLite state. Provider credentials are optional for local paper practice. |
| `album-library` | Personal local music library: set `ALBUM_LIBRARY_ENTRYPOINT` to the installed album-bundle server entrypoint. Binds to loopback; its own configuration owns media paths. |
| `synaesthetic` | PadPilot listening dashboard; `PADPILOT_EVALUATOR_DB_PATH` selects disposable or persistent library state. Build assets with the app's `build:synaesthetic-dashboard` command. |
| `artifact-review` | Set the manifest per [artifact review](../../../../scripts/artifact-review/README.md). |
| `game-art` | Brief-generated native scene previews; see [scene generation](../../../../apps/engine-editor/scripts/game-art/README.md). |
| `pale-reach` / `pale-reach-review` | The bounded traversal course and its existing artifact-review queue; see [Pale Reach evaluation](../../../../apps/engine-editor/verification/pale-reach/README.md). |
| `combat-relay` | Set `TOUCH_OF_DEATH_PROJECT_DIR` to the canonical editor project; see [relay](../../../../packages/engine/examples/touch-of-death/host/README.md). |
| `touch-of-death-audio` | Set `TOUCH_OF_DEATH_WEB_DIR` to the artifact containing `deploy.js`; `/game/` and `/review` share one process. For extracted-host acceptance set `TOUCH_OF_DEATH_HOST_ARTIFACT` to its `host.js`. |
| `touch-of-death-lab` | Build `spikes/persistent-world-worker/lab/build.ts` first. Serves its one artifact at `/lab/`; optional `PERF_LAB_ROOT` selects the evidence root and `PERF_AUDIO_URL` selects the managed game's audio source. |
| `touch-of-death-runs` | Serves registered frozen native runs without rebuilding or restarting the active lab. Use [saved native runs](../../../../spikes/persistent-world-worker/lab/README.md#saved-native-runs); shares `PERF_LAB_ROOT` and optional `PERF_AUDIO_URL`. |

The Touch of Death review surface and `artifact-review` keep distinct manifests,
databases, and ports. The combat relay defaults to SQLite and clears inherited
database URLs; explicit `TOUCH_OF_DEATH_STORAGE=postgres` selects PostgreSQL
acceptance. Storage/environment changes require an owned stop/start; reuse does
not change a running process's environment. Railway credentials stay on Railway.

## Local-auth startup

`bun run dev start books --isolated --local-auth --json` starts an owned Books,
Trade Bot, or PadPilot/Marketplace session using `Local developer`. Substitute
`trade-bot`, `pad-pilot`, or its marketplace alias for the surface. The explicit
flag requires `--isolated`; unsupported surfaces and shared launches reject before
registry/process side effects.

The supervisor binds the server and canonical origin to `127.0.0.1`, selects
development auth, removes inherited `RAILWAY_*` markers from the child environment,
clears the remote database URL, and overrides storage with a new server-ID root
under `.local/dev-server/runtimes/`. Books/Trade Bot receive SQLite files;
Marketplace receives its database and upload roots there. Inherited data paths
cannot redirect this mode to a persistent store. Defaults and parent environment
remain unchanged. Environment snapshots and credentials are not printed or stored
in the registry.

Callers of `@hyperfocus/desktop-runtime/automation/managed-server` can pass
`localAuth: true`; that adapter forwards the flag and retains ordinary isolated
process/ID cleanup. It does not implement auth or environment policy itself.
The Website verification `startManagedSite` wrapper accepts the same option.
Keep its returned handle and call `close()` in `finally`. CLI starts remain
attached as for every isolated server. This local identity does not authorize
third-party provider, broker, publishing, or production operations.

# Browser and device support

The release matrix requires Chromium, Firefox, and WebKit on desktop plus a touch/mobile viewport. A public release needs evidence from all three engines; a local Chromium-only run is not release evidence. Playwright supplies pinned browser builds, which are not claims about current stable Safari or physical devices.

From the repository root, install the matching browser binaries with
`bun packages/engine/node_modules/playwright/cli.js install chromium firefox webkit`
(Linux CI also needs the Playwright `--with-deps` option). From `packages/engine`,
`bun run verify:browsers` runs all three engines against the generated portable
top-down HTML at `1280x720`/DPR 1 and `390x844`/DPR 3. Missing engines fail the gate.
It checks startup, frames, layout containment, keyboard-driven movement, touch
event delivery, console/page errors, and no off-origin asset requests. Firefox
uses touch/viewport emulation without the unsupported `isMobile` browser option.

The report at `.local/engine-release/browser-matrix.json` records completed
profiles, exact browser versions, generated fixture digest, platform, and time.
An interrupted or failed run must not be promoted to release evidence. Physical
Safari/iOS/Android coverage belongs in the deployment's device lab; this emulated
matrix does not prove touch gameplay or device-specific audio permission behavior.
Record reviewed results and their evidence URL in the release evidence file. The
production certification gate rejects a matrix without Chromium, Firefox, WebKit,
desktop, and touch-mobile results.

This is a support contract, not a claim that every browser version works. A release should publish the tested versions and investigate supported-engine regressions before publishing.

## Low-end devices and unreliable networks

Product direction from the user, November 1, 2026: prioritize broad access,
including old iPhones and spotty internet. No exact oldest OS/device, frame budget,
memory ceiling or network profile has been accepted. The desktop 165 Hz game
experiment is not that baseline. Publish tested support rather than interpreting
the direction as a claim that every computing device already works.

The current portable top-down matrix does not cover the standalone 3D renderer,
physical-phone thermal behavior, cold/warm downloads or interrupted acquisition.
Record those separately for the representative game. WebGL2 availability alone
does not establish compatibility with the other JavaScript, DOM and audio APIs.
The [Muratori audit](../../../docs/audits/casey-muratori.md#cm-02-device-capability-and-support-evidence)
owns the current gap and proposed shared compatibility primitive, now explicitly
deferred by the user to the [engine roadmap](release-todo.md#legacy-graphics-compatibility).
Neither the proposal nor its effort estimate establishes device support.

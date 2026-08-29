# Browser and device support

The release matrix covers current stable Chromium, Firefox, and WebKit on desktop plus a touch/mobile viewport. A public release needs evidence from all three engines; a local Chromium-only run is not release evidence.

`bun run verify:browsers` runs the portable top-down build in installed Chromium and Firefox executables, at `1280x720`/DPR 1 and `390x844`/DPR 3. It checks startup, frames, layout containment, keyboard and touch input, console/page errors, and offline request containment. Set `CHROMIUM_PATH` or `FIREFOX_PATH` when the executables are outside the detected platform locations.

WebKit and physical-device coverage belong in the deployment's browser service or device lab. Record those results, the exact browser versions, profiles, artifact digest, completion time, and evidence URL in the release evidence file. The production certification gate rejects a matrix without Chromium, Firefox, WebKit, desktop, and touch-mobile results.

This is a support contract, not a claim that every browser version works. A release should publish the tested versions and investigate supported-engine regressions before publishing.

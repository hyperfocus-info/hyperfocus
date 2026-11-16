# Changelog

This project follows the compatibility rules in `docs/compatibility-policy.md`. Stable breaking changes require a new minor version while the major version is zero.

## Unreleased

### Added

- Framework-neutral static and primitive GLB writers at `@hyperfocus/engine/assets/model-cooking`, used by both the editor and the Touch of Death example; mono PCM WAV encoding in the audio entry.
- A validated mutable 3D declaration reader for authoring consumers. It retains the caller's canonical object identity.

- Atomic complete-group matchmaking with application-owned selection, durable assignment inspection and retry-safe host finalization.

- Machine-checked `0.0.x` package-entrypoint compatibility contract.
- Provider-neutral atomic session replay store boundary for cross-process one-use admission.
- Authenticated AES-256-GCM persistence-backup encryption with key-ring restore and rotation support.
- Security response, browser evidence, soak, and incident-rehearsal release gates.
- Fail-closed public-package and production-MMO evidence certification; ordinary npm publishing runs certification through `prepublishOnly`. Trusted publishing still needs the external setup in `docs/release-todo.md`.
- First-party WebGL2 direct-light metallic-roughness/emissive PBR material evaluation.
- Deterministic distance-band LOD selection and safe first-party scene mesh rebinding.
- Authenticated deployment control-plane clients and handler for shared replay, remote persistence, external key rings, regional coordination, and capacity actuation, plus an active two-person on-call roster guard.
- Optional first-directional-light shadow mapping, bounded position morph targets, static glTF morph cooking, and integrated bounded terrain chunk streaming.
- Quaternion/angular rigid-body state and bounded deterministic distance constraints.
- Configurable numeric batch dispatch with a measured conservative WASM crossover, plus same-module scalar/SIMD collision exports and benchmark coverage.
- Fixed-capacity retained cursors and configurable render-record reuse; the MMO example adopts its measured fresh-record default.

### Fixed

- Preserve wall/floor CCD coverage for late continuous bodies by rejecting distant swept pairs before charging the detailed-test budget. Detached gameplay diagnostics expose both runtime and knockout physics; [rigid physics](docs/rigid-3d.md) documents the updated counter semantics and checkpoint compatibility.
- Release retired meshes and failed fallback textures exactly once; clear destroyed material flags while preserving hidden-texture retirement.
- Browser pixel ratio is supplied by the host instead of read from engine globals.
- Touch of Death now lives in `examples/touch-of-death`. The public `createTouchOfDeathPreset` and `configureTouchOfDeathCombos` names remain deprecated, frozen 0.0.x compatibility fixtures; workspace game consumers use the example's exports for current balance.

- Preserve valid matchmaking owner indexes when expired tickets are replaced or retired by FIFO matching, so saved service records remain restorable.

- Remove unused Meshopt encoder/decoder startup payload from the Three.js renderer.
- Check every delivered JavaScript artifact, native dependency graph and rebundled consumer, with explicit feature-growth ceilings and compressed aggregate limits documented in `docs/bundle-size-evidence.md`.
- Keep engine sources within structure limits through focused frame-audit, pose/contact, history, ragdoll-control and physical-performance modules; public entrypoints are unchanged.
- Validate the standalone HTML and its build receipt in starter and beginner-journey release checks.
- Include the declared 3D material preset subpath in package builds and installed-consumer verification.
- Emit explicit audio/material re-exports and extension-correct SFX declarations for NodeNext consumers.
- Run the portable browser fixture in Chromium, Firefox, and WebKit with desktop/touch profiles and a versioned evidence report; missing browsers fail validation.
- Use owned hidden subprocesses for release compilation and external package consumers on Windows.

### Security

- External replay-store failures reject admission instead of falling back to process-local replay state.
- Encrypted backup restore authenticates its header and ciphertext before persistence validation or mutation.

## 0.0.1 - 2026-08-22

- Initial packaged Hyperfocus engine release.

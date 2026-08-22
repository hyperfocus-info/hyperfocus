# Changelog

This project follows the compatibility rules in `docs/compatibility-policy.md`. Stable breaking changes require a new minor version while the major version is zero.

## Unreleased

### Added

- Machine-checked `0.1` package-entrypoint compatibility contract.
- Provider-neutral atomic session replay store boundary for cross-process one-use admission.
- Authenticated AES-256-GCM persistence-backup encryption with key-ring restore and rotation support.
- Security response, browser evidence, soak, and incident-rehearsal release gates.
- Fail-closed public-package and production-MMO evidence certification, enforced by trusted publishing.
- First-party WebGL2 direct-light metallic-roughness/emissive PBR material evaluation.
- Deterministic distance-band LOD selection and safe first-party scene mesh rebinding.
- Authenticated deployment control-plane clients and handler for shared replay, remote persistence, external key rings, regional coordination, and capacity actuation, plus an active two-person on-call roster guard.
- Optional first-directional-light shadow mapping, bounded position morph targets, static glTF morph cooking, and integrated bounded terrain chunk streaming.
- Quaternion/angular rigid-body state and bounded deterministic distance constraints.

### Security

- External replay-store failures reject admission instead of falling back to process-local replay state.
- Encrypted backup restore authenticates its header and ciphertext before persistence validation or mutation.

## 0.1.0 - 2026-08-22

- Initial packaged Hyperfocus engine release.

# Platform Hardening and Experimental Roadmap

This task tracks ideas from the August 2026 platform-hardening pass that cannot be shipped safely as one change.
Completed foundations live in code and contract tests; unchecked work requires its own design, threat model, and
measurable acceptance test before implementation.

## Remaining host/runtime work

- [ ] Prove frame-complete Analyzer capture during unbounded offline bounce without allocation, blocking, or I/O in
  `processBlock`. Acceptance: a ten-minute render at maximum host speed produces zero dropped slices and sample-identical
  note timing.
- [ ] Project full host transport (tempo ramps, PPQ, time signature, loop range, play/record state) to Script Thread.
  Acceptance: projection error stays below one millisecond across ramps and seeks.
- [ ] Add managed-media lease/reference manifests and conservative garbage collection. Acceptance: referenced media is
  never removed; unreferenced fixtures are reclaimed after a documented grace period. DAW project files are opaque, so
  deleting from process-local reference counts alone is forbidden.
- [ ] Add signed offline license cache and explicit offline Marketplace states. Acceptance: licensed studio can remain
  disconnected for the documented lease while revocation and clock-rollback rules fail closed.
- [ ] Evaluate Crashpad for VST-safe local minidumps. Acceptance: crash capture must not install a handler that destabilizes
  or overrides the DAW host's own crash handling.

## Experimental research tracks

- [ ] Analyzer-to-haptic and transient haptic routing, adaptive resistance, and sub-block automation interpolation.
- [ ] Gesture recognition, local workflow prediction, offline voice commands, and acoustic preset matching.
- [ ] WebRTC mirroring, mDNS sync, and content-addressed studio package sharing.
- [ ] QuickJS-hosted WASM, zero-copy visualizer transport, and opt-in self-healing Module development mode.
- [ ] Sixty-second input flight recorder and resource-constrained native-render fallback.
- [ ] Acoustic pairing and optional chromastereoscopic mapping view.
- [ ] Encrypted Module delivery and performance-provenance signatures, subject to a threat model that does not claim
  impossible “100% protection” on user-controlled hardware.
- [ ] Virtual MIDI/HID driver, WebHID experiment, and webcam-assisted controller mapping.
- [ ] Native scale alignment with standard and microtonal tunings.
- [ ] Usage-based billing only after privacy, refund, offline, fraud, and transaction-cost reviews. Per-trigger network or
  payment work is forbidden on realtime/input paths.

Each track must become a separate task before coding. Public capabilities must remain Module-generic; no factory-only
processor, editor, bridge, or stream paths.

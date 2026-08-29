# Sandbox External Module UI

- Owner: PadPilot runtime maintainers
- Deadline: 2026-09-30, before Marketplace custom-UI Modules are enabled in production
- Current safety policy: external UI bundles fail closed. `PADPILOT_ALLOW_UNSAFE_EXTERNAL_MODULE_UI=true` is a development-only acknowledgement that executes third-party code in the privileged host WebView.

## Exit Criteria

- External Module UI runs in an isolated realm without direct access to `window.__JUCE__`, host globals, cookies, storage, or another Module's state.
- A source-bound broker issues unforgeable, revocable grants only for capabilities declared by the selected, ready Module.
- Selection changes revoke old grants and stop background/timer access from the previous Module.
- State, capability streams, file access, MIDI export, keyboard output, and host transport each have bounded schemas and denial tests.
- Adversarial tests prove one Module cannot select another Module, forge its handles, observe its messages, or invoke raw native functions.
- The unsafe opt-in and this temporary exception are removed.

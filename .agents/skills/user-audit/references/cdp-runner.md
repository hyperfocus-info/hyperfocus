# CDP runner

The runner sizes the real owned browser window through `scripts/audit-viewport.ts`.
Emulated Chromium viewports can deliver clicks to an opaque iframe element without
forwarding them to its content, even when both documents report correct hit geometry.
For Playwright fallback probes, create the page with `viewport: null`, then call
`setAuditViewport({ send: (method, parameters) => cdp.send(method, parameters), width, height })`
with that page's CDP session. The helper measures browser chrome, verifies actual
client dimensions and fails when the requested size cannot be reached. Keep the
owned browser headless; do not substitute synthetic element clicks for missing input.
Some Windows Chromium builds enforce a minimum real client width (512px in the
observed build). Record an unsupported narrower viewport honestly; a larger real
viewport does not prove a 390px journey. Preserve separate narrow layout evidence
without treating emulated opaque-iframe pointer failures as product failures.
For explicit main-frame narrow layout/keyboard checks, pass `mode: "emulated"` to
the helper, `audit.setViewport(390, 844, { mode: "emulated" })` to a scenario, or
`--viewport-mode emulated` to the runner. Each flow retains structured viewport mode
and input-evidence scope. This is opt-in, never a silent fallback; opaque-iframe
pointer workflows still require actual-window evidence.

For separate desktop/mobile campaigns, freeze device-specific goals and interaction
paths before execution. Resizing the same path is responsive coverage, not a new
device journey. `scripts/device-paths.ts` rejects viewport/observation-only path
differences; compare recorded interaction traces and measured dimensions, and keep
the device assignment independent from unassessed sampled reactions. The checked
`scripts/device-workflow-scenario.ts` accepts a frozen `AUDIT_DEVICE_MISSION` input
and captures entry, decisive and recovery states through this runner.
Destination checks require accepted section/module IDs and visible panel-specific
state; a destination's label remaining in navigation does not prove it is active.
The device guard includes a wrong-panel negative control. Derive execution totals
from raw checks through `quality/observations.ts` and bind exact dispatch arguments;
call-method counts alone do not independently bind targets or ordering.

Scenario modules export an async `run(audit)` function. The `audit` object provides:

- `persona`: the sampled reaction constraints for this invocation. Use them to
  select meaningful actions and assertions, not only to label the report.

- `flow(metadata, action)`: execute one scenario and capture screenshot/state.
  - `clickSelector`, `clickAria`, `clickText`, `typeInto`, `selectOption`, `press`, `setViewport`.
    `typeInto` accepts visible, enabled, editable text-like native inputs and textareas; it
    rejects hidden, disabled (including disabled fieldset descendants), readonly,
    inert, or unfocusable targets before changing their value. It rejects hidden,
    checkbox, file, and button input types; number and date-like text controls remain
    supported. `selectOption`
    applies the same visibility, enabled, inert, and focus checks to native selects.
    Disabled options and options in disabled optgroups are rejected before mutation.
    Both use native value setters and dispatch DOM input/change events for reactive
    controls; those events are programmatic and do not establish trusted user input.
    Click target lookup also rejects controls beneath `[inert]` or
    `aria-hidden="true"` ancestors; this state check is not a full accessibility-tree query.
    `clickText(value, contains = true)` defaults to substring matching; pass
    `false` for an exact short label. The narrow FX audit otherwise selected
    **FX tools** instead of the **FX** module. Check required action results:
    a helper's `{ ok: false }` is not automatically thrown, and `waitFor` returns
    `false` on timeout. Record or reject that result before continuing to an
    outcome assertion. Optional discovery probes may retain a false result with
    its actual scope.
    `clickRole({ role, name })` matches an explicit ARIA role and exact label/text,
    including custom options, and rejects ambiguous matches. It is not a full
    accessibility-tree query. `doubleClickSelector(selector)` uses real CDP pointer
    events for controls with a numeric-entry gesture and rejects covered targets.
    `clickPointerSelector(selector)` supplies a trusted single click for browser
    user-activation gates; existing click helpers dispatch programmatic DOM clicks.
    `typeText(value)` inserts literal text into the currently focused native browser
    surface, including terminal renderers that do not expose a regular input field.
    A trusted click does not make a native file picker safe to open: retain the
    audit's window constraints and label any browser-capability fallback fixture.
    `press` accepts modifier chords such as `Control+i` through real CDP key events.
    For frame-sampled game input, use `press({ key: "1", holdMs: 100 })` to keep
    the real CDP key down across runtime ticks; the backward-compatible string
    form remains an immediate press. Holds accept 0 through 5,000 milliseconds.
- `evaluate`, `waitFor`, and `sleep` for app-specific state setup. For asynchronous
  media, use a bounded ready-state and advancing-time predicate before judging
  playback; a fixed sleep is not readiness evidence. Retain source, duration,
  paused state and before/after media time. Muted progression is not listening
  quality.
- `evaluateFrame(selector, expression)` evaluates inside an attached iframe's own
  default context, including opaque sandboxed `srcdoc` frames; unavailable contexts
  fail explicitly instead of inspecting the parent document.
- `waitForDownload(extension, timeoutMs)` retains a completed browser download in
  the run's `downloads/` evidence folder before the disposable browser profile is
  removed.
- `setInputFiles(selector, files)` supplies existing local files to a file input
  through CDP and dispatches native browser file-input events without opening a
  desktop picker. This verifies the application's import/upload handling; it
  does not verify the operating-system file selection journey.
- Before an action can open a native alert, confirm, or prompt, register
  `setDialogHandler({ decide: async dialog => ({ accept: false }), timeoutMs: 5000 })`.
  The scenario explicitly chooses acceptance and optional `promptText`; opening,
  message, type, decision, and failures are retained in `results.json`. Missing,
  invalid, thrown, or timed-out decisions dismiss without acceptance and fail the
  audit, so a blocked page cannot silently hang a click forever.

The runner exits nonzero for recorded action failures or uncaught page exceptions,
including initial-render failures before the first flow. Raw and compact summaries
separate `uncaughtExceptionCount` from `actionFailureCount`; `executionPassed` is
an execution check, not release acceptance. Bound capture adds `capture.stable`.
Pass `--artifact`, `--mission-contract`, and `--persona` together for release
verification; changed capture inputs also cause nonzero exit. See
[evidence reconciliation](evidence-reconciliation.md) for hashed capture identity,
frozen assertions and disposition of final evidence. `--persona` alone replays
the exact sampled manifest for an exploratory run without certifying capture.

The runner captures the actual viewport. Custom Playwright scenarios should use
`scripts/capture-audit-page.ts` for viewport or full-page evidence. On Windows,
full-page capture can remove scrollbars, widen the layout and crop its right edge.
The helper retains the existing scrollbar gutter during capture and rejects a
changed viewport width. Check actual target bounds and viewport captures before
calling apparent full-page cropping a product defect.

Uncaught page exceptions are retained in `consoleEntries` with
`source: "Runtime.exceptionThrown"`, including source locations and stacks. A
successful action receipt does not prove its event handler completed; inspect
these errors and the resulting domain state before judging the flow.

The full report records scenario API calls in `measurements.actions`. Compact
`user-audit-handoff-v2` aggregates these by action into count, failed count, and
total duration, retaining each flow's story IDs and viewport evidence scope.
These are automation calls, not human click counts; timings include helper waits.
A failed sample means a throw, `false`, or `{ ok: false }`; an evaluated predicate
may legitimately return `false`, so this count is not a count of product bugs.
Read `handoff.json` first for compact navigation, then follow its references to the
full persona, screenshots, and `results.json`. `evidence-size.json` measures the
raw and handoff byte sizes; it does not estimate model tokens or discard evidence.

Run:

```text
bun .agents/skills/user-audit/scripts/run-cdp-audit.ts --base-url http://localhost:8791 --scenario .local/user-audit/scenario.ts --surface <product> --goal <outcome> --seed <text>
```

Use `.local/screenshots/user-audit-*` for generated evidence unless the user chooses another destination.
The human-readable DOM transcript is `dom-text.tmp.md`; it records its owner and
pruning condition. Keep reusable findings in the owning product queue before
pruning run evidence.

For exports, wait for a delivered file **or an explicit rejection beside the
action**. A rejected clipping check is a product response, not an encoding
timeout. Record the exact alert and its viewport position; follow the stated
recovery (for Mastering, lower Gain or enable the limiter, apply, then retry).
Keep the original failed receipt and label a recovery replay separately. Never
disable a quality gate merely to make a download assertion pass.

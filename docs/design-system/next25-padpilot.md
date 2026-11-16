# Seven PadPilot dialogs

2026-09-21. Browser-host evidence; candidate implementation, not native-host acceptance.

The shared app-local `Modal` caused horizontal overflow in all seven real tasks at
390px with 200% text. Scrolling the entire panel also moved its heading and Close
away. It now uses the existing semantic tokens and the shared Dialog composition:
fixed heading, scrolling description/body, wrapping fixed footer. Focus arriving
outside the dialog is trapped, descriptions are associated, and existing nested
Escape/focus-return behavior remains. The adapter retains its existing size,
class, initial-focus, backdrop/Escape, and embedded overlay-root contracts; the
shared `Dialog` does not expose those contracts, so replacing it would broaden the
shared API unnecessarily.
Create Module, custom layout and Update use the footer slot. Installation and
Marketplace actions remain within their scrolling task body; their evidence does
not claim a persistent primary action.

Release notes and Browser installation now consume the shared `Disclosure` through
`@hyperfocus/ui/primitives`. The same default-closed native-details contract is
used by Website starters, page creation, recovery, extensions, product-table
import, live settings transfer and deployment guidance. No API extension was
needed. PadPilot's real-host captures provide a second host boundary, including
Enter/Space toggle checks for both disclosures and pointer expansion of notes.

## Each task and its similarity scan

All searches covered `apps` and `packages/ui/src`, then the named implementation
owners. Each screenshot comes from the actual `/app` runtime, reached through its
visible launchers. Controller mapping creation affects only the disposable browser
profile. No account, checkout, provider, native install, or updater action ran.

| Surface | Observed failure and improvement | Project-wide pattern scan and owner decision | Checks |
| --- | --- | --- | --- |
| Create Module | Scaled footer/content 369px in 340px; long helper text competes with name. Wrapping shared footer and task/result copy preserve name and Create. | Searched `initialFocusRef`, `footer`, `onCreate`: CreateModuleModal, FX preferences, shared Dialog and editor new-project forms. Modal owns sizing/focus; Module creation owns its acknowledgement draft. No new form primitive. | Blank name disabled; named draft enables; existing rejection/duplicate-submit tests; Escape. |
| Controller preferences | Scaled content 475px in 325px; repeated routing heading and live snapshots repeatedly detach row buttons, blocking real pointer clicks. Rows retain identity while unchanged; device assignments lead; preview grid clamps. | Searched `normalizeControllerConfig`, `minmax(12rem`, `For each={rows()}`: controller preferences, custom layout, input preview; provider already owns host state. Memo reconciliation belongs at this normalized rendering boundary; Modal owns scroll. | Real Add Device/Custom Layout clicks; unchanged host snapshot retains control/focus; empty/live preview tests. |
| Custom controller layout | Scaled content 400px in 325px, Close clipped and Save after the entire long mapping list. Shared fixed footer and clamped grids retain Save; learning status moves above mappings with Stop learning that keeps draft. | Searched `Learn`, `learnTarget`, `Listening for`: controller custom layout and HotkeyMacroField recorders. Hardware learn target belongs to controller modal; recorder workflows have distinct input ownership. No generic recording framework. | Real nested pointer opening, name draft, Learn/Stop learning; saved draft retained; nested Escape. |
| Diagnostics | Scaled content 329px in 325px; raw counters appear before sampling context. Status now explains active chains and unavailable timing; shared modal replaces competing overflow override; grid clamps. | Searched `runtimeDiagnostics`, `profilingEnabled`, `role="status"`: DiagnosticsModal, editor profile, Harness Health. Host-specific metric semantics remain local; shared Modal fixes visibility. | Status visible; timing helpers and disabled devtools tests; header retained at scroll end; Escape. |
| Module installation | Scaled content 376px in 340px; always-visible browser caveat overwhelms ZIP task and falsely claims session-only persistence. Browser detail is disclosed and correctly describes profile persistence. | Searched `Requested capabilities`, `moduleInstall`, `persistDevModuleBundle`: ModuleInstallModal, marketplace download handoff, IndexedDB owner. Existing install flow and FileUploadDropzone own validation/recovery; Modal owns layout. | Real invalid ZIP → alert and enabled Retry; focused capability approval/native-success/retry contract tests; Escape. |
| Marketplace catalog | Scaled content 347px in 325px; search has no explicit label and a failed query falsely claims nothing is published. Named search and Clear search distinguish query recovery from an empty catalog. | Searched `No .*published`, `No .*match`, `browseQuery`: marketplace, editor resource/file/asset browsers, Harness project switcher. Empty-query semantics remain in catalog consumer; canonical TextField and Button reused. | Real query/clear pointer journey; source stays below 400 lines; Escape and shared scroll checks. |
| Update review | Scaled content 361px in 325px; long release notes push action below fold and “Update” hides staging behavior. Stage update now stays in the fixed Modal footer, status precedes disclosed notes, and duplicated explanation is removed. | Searched `releaseNotes`, `stagedUpdate`, `checkForUpdates`: marketplace updater/store and native update bridge. Store keeps staging semantics; disclosure is native details and Modal owns containment. | Synthetic version response; Stage update geometry stays inside viewport at all three sizes and while expanded notes scroll; no staging/download/restart invoked; Escape. |

## Evidence and replay

- [Before report](../../.local/design-system/evidence/next25-padpilot/before/report.json): 21 captures, desktop
  1440×1000, narrow 390×844, and narrow with 200% base text.
- [After report](../../.local/design-system/evidence/next25-padpilot/after/report.json): the same 21 captures,
  seven header-retention checks, seven pointer/task and Escape checks; zero page
  errors. Each report directory contains named PNGs and actual Windows browser
  visibility inspection with zero visible windows.
- [Custom layout before](../../.local/design-system/evidence/next25-padpilot/before/custom-layout-scaled.png)
  and [after](../../.local/design-system/evidence/next25-padpilot/after/custom-layout-scaled.png).
- [Update before](../../.local/design-system/evidence/next25-padpilot/before/update-narrow.png) and
  [after](../../.local/design-system/evidence/next25-padpilot/after/update-narrow.png).

Run the managed PadPilot host, then
`bun apps/pad-pilot/scripts/design-system/next25-padpilot/capture.ts`.
`DESIGN_CAPTURE_PHASE=before` records the baseline without after assertions; retained
  baseline images were taken before these changes, not reconstructed from edited code.
Focused tests are Modal, ControllerPreferencesModal, CreateModuleModal,
DiagnosticsModal, and ModuleInstallModal under `apps/pad-pilot/ui/src/components`.
All 25 focused tests and the PadPilot app typecheck pass. The shared-disclosure
migration additionally passes 17 Modal, Module-install and marketplace-store tests.
Touched declarations pass source limits without baseline increases.

The rendered dialogs are session state, not persistent workbench panes. Controller
configuration remains project state; updater channel retains existing app-user
ownership. No pane persistence or DSP semantics changed. Native WebView, DAW,
physical-controller and actual update acceptance remain separate (DD-009).

# Editor settings

The screenshot-review follow-up gives narrow panes one named section picker,
removes the repeated section heading there, and moves secondary Reset below the
settings. Shared segmented controls make selection explicit; a common scope is
shown once while mixed-scope results retain per-row labels. Section descriptions
span the available width at 200% text. The existing settings capture now waits
for transient save feedback to clear before recording the scaled reference.

Iteration 9 of the [ten-surface run](ten-surface-run.md). Find an appearance,
workspace or project setting, understand its scope, and save it deliberately.

Settings now precedes the separate input-binding editor. Section navigation uses
short labels; descriptions belong to the selected section. Search spans sections
and has explicit clear/empty recovery. Rows use semantic typography and intrinsic
columns; segmented choices wrap and fields have no fixed minimum that can widen
a narrow pane. Shared Input, CheckboxField, Button and SelectControl provide the
control behavior. Toggle and range controls have their actual setting names and
associated descriptions, rather than only On/Off or a numeric value.

The existing `PreferencesSurface` remains the owner; no settings framework was
added. A reactive child control retains its DOM node when the host publishes
edited values. Tests reproduced the previous text-field focus loss before the
fix. Save errors appear beside Save and retain the draft for retry. Live preview,
cleanup, staged input saves and reset behavior remain; reset help states its
actual application/input scope instead of claiming to reset only visible rows.

Project Center reveals the selected tab by adjusting only the tab list's
`scrollLeft`. It observes container and tab sizes, including text scaling, without
moving focus or scrolling the page. This closes DD-020 for the real center host.

Evidence: [before/after](../../.local/design-system/evidence/editor-settings). With the managed Editor:

```powershell
$env:DESIGN_CENTER='settings'
bun.cmd apps/engine-editor/scripts/design-system/editor-centers/capture.ts
bun.cmd test --conditions=browser packages/ui/src/preferences/preferences.test.tsx apps/engine-editor/src/app/editor-preferences-view.test.tsx apps/engine-editor/src/app/input-map-editor.test.tsx apps/engine-editor/src/editor-shell-boundary.test.tsx
```

Fifteen focused tests / 111 assertions, Editor typechecks and targeted lint pass.
Ten browser groups pass with zero errors/windows: named keyboard controls, clear
search focus, real project-name Save and canonical undo, desktop/tablet/mobile,
200% text, 320px short and wide layouts. The selected History tab fits inside the
320px viewport after resize and preserves focus. Browser evidence does not claim
that every legacy preference consumer or every theme has been recaptured.

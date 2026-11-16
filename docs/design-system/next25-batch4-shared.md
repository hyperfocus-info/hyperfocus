# Complete selection names

Atlas clip names and PadPilot modulation destinations share long prefixes and
meaningful suffixes. Ellipsis in the open options hid the actual choice. PadPilot's
baseline renders distinct `Wide Dream / node / control` destinations as the same
`Wide Dream...` label. This is a shared-control failure, not a theme issue.

Both `SelectControl` and `createDomSelectControl` now wrap open option names,
including unspaced strings. Their existing list owners size rows to their content
and scroll the list. Closed triggers remain compact. Search, selected value,
keyboard navigation and focus return keep their existing contracts.

The larger catalog exposed a second failure: wrapping alone allowed rows to
shrink below their text height. The preserved [intermediate failure](../../.local/design-system/evidence/next25-batch4-shared/wrapping-failure/padpilot-scaled.png)
shows overlapping options. A 27-option regression now checks row height as well
as horizontal clipping. The imperative adapter also clamps tall popups vertically
and keeps search separate from list scrolling.

Run `bun packages/ui/scripts/design-system/selection-labels/capture.ts`.
The [before report](../../.local/design-system/evidence/next25-batch4-shared/before/report.json) covers three
adversarial clip choices in both adapters at four sizes. The [after report](../../.local/design-system/evidence/next25-batch4-shared/after/report.json)
adds a 27-option stress catalog, keyboard selection, focus return, unspaced labels
and open popup bounds. The original three choices remain in the stress catalog;
the larger list is not claimed as a matched before catalog.

Real consumer captures belong to [Atlas](next25-batch4-editor.md) and
[PadPilot](next25-batch4-padpilot.md). Isolated controls do not certify their hosts.
All captures own a hidden headless browser and inspect its Windows process tree.

Website review also found a native checkbox staying at browser-default pixel size
inside an enlarged `CheckboxField` column. The existing field now marks its native
input boundary; shared CSS scales only native checkboxes in that field to 1rem.
Custom controls retain their rendering. The [Website task capture](next25-batch4-website.md)
checks the actual native glyph and full-row touch target, not only wrapper height.
No new control API, token or variant was added.

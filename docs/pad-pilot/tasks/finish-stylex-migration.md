# Finish PadPilot StyleX migration

- Owner: PadPilot UI
- Deadline: before public beta
- Status: active

## Context

PadPilot now builds with Hyperfocus's combined Solid/StyleX compiler. Shared
floating behavior plus the Button, Toggle, Dropdown, Modal, Tooltip, ButtonGroup,
host BPM, and MIDI drag primitive family use StyleX. Forty-four legacy CSS Modules
remain in branded app/Module surfaces and older domain elements.

## Exit criteria

- No `*.module.css` files remain under `apps/pad-pilot/ui/src`.
- Component styling uses colocated StyleX and shared semantic tokens/CSS variables.
- Only document reset and unavoidable vendor CSS remain global.
- UI interaction tests, typecheck, and embedded UI build pass after each zipper slice.
- Visual acceptance covers desktop browser, narrow plugin window, 100%/150% zoom,
  keyboard navigation, focus return, popover clamping, and disabled states.

Do not bulk-convert selectors without behavior review. Migrate one owning primitive
or Module family at a time, then delete its CSS Module.

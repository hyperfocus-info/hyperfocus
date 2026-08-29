---
name: create-or-update-padpilot-elements
description: Build or refactor reusable PadPilot Solid elements with StyleX, forwarded host props, shared Hyperfocus interaction primitives, and host-safe audio-widget behavior.
---

# PadPilot Element Authoring

Use for `apps/pad-pilot/ui/src/components/elements`, PadPilot element APIs, and
domain primitives under `ui/src/padpilot/primitives`.

## Ownership

- `@hyperfocus/ui` owns generic interaction/accessibility: overlays, floating
  collision/clamping, dialogs, popovers, tabs, tooltips, focus, and preferences.
- PadPilot wrappers own skins, audio widgets, controller semantics, managed file
  import, Module compatibility, and host branding.
- Deepen shared behavior when two apps need it. Never make `@hyperfocus/ui` depend
  on PadPilot, JUCE, host state, persistence, or audio concepts.

## Contract

1. Inspect component, tests, shared primitive candidate, and consumers.
2. Extend correct Solid host attribute type and use `splitProps` so `class`,
   `style`, `id`, `data-*`, `aria-*`, refs, and handlers survive.
3. Use `Omit` when value callbacks collide with native prop names.
4. Use StyleX for new/touched styles. Preserve caller classes through `classList`;
   use slot classes only where consumers genuinely skin internal parts.
5. Use shared overlay/floating behavior. No local modal, tooltip, popover, dropdown,
   tab, Escape, z-order, or viewport-collision implementation.
6. Keep element-only state local. Never persist audio state in the browser.
7. Preserve caller casing. Icon-only buttons derive accessible names from `tooltip`.
8. Keep dynamic numeric labels stable with tabular numerals.

Test prop forwarding, accessible role/name, disabled state, keyboard/focus behavior,
cleanup, tooltip/skin behavior, and the element-specific interaction.

Run from repository root:

```powershell
bun.cmd run --cwd apps/pad-pilot typecheck
bun.cmd run --cwd apps/pad-pilot test:ui
bun.cmd run --cwd apps/pad-pilot build:ui
```

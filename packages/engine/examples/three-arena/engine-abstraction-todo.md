# Engine Abstraction TODO

## P0
- [ ] Keep local: Run scanner tests and `--check` whenever its heuristic output changes.

## P1
- [ ] @hyperfocus/engine: Watch for deadzone/button threshold drift back into game-local input; add a second target before widening the API.
- [ ] @hyperfocus/engine/render/3d: Guard against rebuilding first-success loader, mesh prep, or clone-cache helpers in game-local code.
- [ ] @hyperfocus/engine/render/3d: Guard against rebuilding local geometry/material maps; keep only resource definitions in the demo.
- [ ] @hyperfocus/engine/protocol: Guard against rebuilding snapshot-frame wrappers around protocol encode/decode helpers.
- [ ] @hyperfocus/engine/render: Guard against rebuilding local effect lifetime loops; keep mesh-specific hooks in the game.
- [ ] @hyperfocus/engine/ui: Guard against rebuilding raw theme-variable appliers or base control CSS helpers in game-local code.
- [ ] @hyperfocus/engine/ui: Guard against rebuilding roving focus in game-local menus; keep menu content and enabled rules local.
- [ ] Keep local: After any optional code patch, run the narrowest build/test lane that covers touched behavior.

## P2
- [ ] Keep local: Keep content tables, combat identity, props, waves, and palette local; promote only content-free selectors or state machines when proven by another game.
- [ ] @hyperfocus/engine/core: Keep nearest/low-frequency adoption; revisit bullet and hazard loops only after a helper beats the local toroidal raw loop.
- [ ] @hyperfocus/engine/render/3d: Leave Three frame shell local until another 3D browser client repeats the same ordering.

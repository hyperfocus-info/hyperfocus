# Engine Abstraction TODO

## P0
- [ ] @hyperfocus/engine/render: Guard against drift by keeping render frame-pool imports on `@hyperfocus/engine/render` and avoiding a new game-local pool.
- [ ] @hyperfocus/engine/server: Run/refresh replication bench, then extract the smallest allocation reducer with a before/after metric.
- [ ] @hyperfocus/engine/render: Keep `src/client/render/` Canvas-free; if map overlay grows, split authored data from generic draw helpers.
- [ ] Keep local: Run scanner tests and `--check` whenever its heuristic output changes.

## P1
- [ ] @hyperfocus/engine/mmo: Watch for deadzone/button threshold drift back into game-local input; add a second target before widening the API.
- [ ] @hyperfocus/engine/server: Split one small static-discovery or cell-envelope helper from segmented replication only after a second target or a smaller isolated test proves the API.
- [ ] @hyperfocus/engine/mmo: Reduce one call-site family from separate maps to normalized entity selection using existing engine MMO helpers, then measure responsibility shrink.
- [ ] @hyperfocus/engine/mmo: Guard against drifting simple range target selection back into game-local Math.hypot loops.
- [ ] @hyperfocus/engine/ui: Guard against rebuilding raw theme-variable appliers or base control CSS helpers in game-local code.
- [ ] @hyperfocus/engine: Try a small adoption of existing pointer helper in one client path while preserving map overlay blocking behavior.
- [ ] @hyperfocus/engine/ui: Guard against rebuilding one-open optional-panel state in game UI; keep panel names and copy local.
- [ ] Keep local: After any optional code patch, run the narrowest build/test lane that covers touched behavior.

## P2
- [ ] Keep local: Audit map overlay helpers for generic marker/legend primitives, but leave regional terrain, route anchors, labels, and palette in the demo.
- [ ] Keep local: Keep content tables, combat identity, props, waves, and palette local; promote only content-free selectors or state machines when proven by another game.
- [ ] @hyperfocus/engine/mmo: Leave client frame shell local until another authoritative browser client repeats the same ordering.
- [ ] @hyperfocus/engine/render: Guard against rebuilding local absolute-time effect compaction or FIFO cap logic; only revisit server transient schema with a second proof.

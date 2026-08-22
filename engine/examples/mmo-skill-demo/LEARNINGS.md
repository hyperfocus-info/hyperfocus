# UX Learnings

## Reusable Patterns

- Persistent canvas-game objectives should stay compact: one next action, one live progress line, details moved to optional panels.
- Connected terrain should read as one surface across many cells; avoid repeating decorative tile icons when roads or water span large areas.
- Ability VFX should layer semantic color, shape, motion, and sound so weapon identity reads first, while critical paths and actor labels stay readable.
- World-building changes should connect map placement to lore, route, faction, and quest records. A prop without a WHY is decoration; a place with a linked reason becomes playable world structure.
- Density tools should output next actions, not just counts. Agents need chunk score, dominant causes, nearest anchors, relocation targets, and quest hooks to make sparse or dense areas better.
- Sparse space can be intentional when it reads as wilderness, travel cost, or danger. If it has no visual cause, add a small readable world reason before adding more systems.
- Wide 2D maps need good-looking travel texture, not only good landmark cameras. Random coordinate screenshots should still show local palette, path material, and low-priority prop ecology before text or major anchors appear.
- Procedural helpers should keep designer control: generate evidence and candidates, then require an explicit WHY before editing content.
- High-throughput AI content work needs deterministic handoff packets: objective, evidence, owned paths, commands, snippets, and acceptance checks. This keeps subagents from rediscovering facts and makes review cheaper.
- Canvas hover targets need DOM-grade tooltip readback when marker symbols carry progression or failure risk; names, gates, and state should appear without opening panels.
- Startup loaders should show real bundle progress through smoothed motion so first paint feels alive without hiding missing or failed assets.

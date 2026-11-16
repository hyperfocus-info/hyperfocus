---
name: world-building
description: Add or revise MMO Skill Demo places, landmarks, ecology, faction presence or travel/quest hooks, including density audits and world notes. Not for generic worldbuilding outside this example or isolated ability mechanics.
---

# World content

From the example root, find the affected zone/chunk/faction in
`docs/world-building.md`, then trace its data/render owners. Consult
`docs/world-travel.md` or `docs/future-quest-ideas.md` when routes or quest meaning
change. Approved areas, screenshots and `assets/world/NOTES.md` establish visual
direction; ask for a concrete taste choice only when those cannot resolve it.

Choose additions or moves from local ecology, services, faction pressure and
player goals. A density score suggests where to inspect; it does not justify
filling intentional wilderness or prescribing a fixed number of props. Verify
both appearance and play: landmarks alone cannot fix a missing combat attractor;
gathering density also depends on readable/filterable resource pins. Preserve
legacy zone constraints and disclose unimplemented expansion features.

Use [discovery helpers](references/discovery.md) for density surveys, asset lookup,
candidate snippets or quest seeds. Direct edits remain appropriate for a known
small change. Generated output is a candidate; inspect it before integration.
Use available assets before acquiring more and preserve provenance.

Update the affected world/travel notes with player-facing meaning; add future
quest notes when there is a concrete throughline. Validate changed data/behavior
with targeted tests and the example build; run `bun.cmd run screenshot:world`
when terrain, landmark or route readability changes. Stop when the requested
area works and reads correctly; do not make every pass a lore-system expansion.

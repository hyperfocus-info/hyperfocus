# MMO Skill Demo Notes

- Existing MMO docs frame the engine as authoritative rooms and zones, not a full MMO platform.
- [MMO Field](../mmo-field/README.md) already proves basic room lifecycle; this example adds a stricter 100-player public room with resource, combat, progression, and visibility behavior.
- The tile-map API works well as the shared source for terrain, collision tags, and resource-node extraction.
- Interest filtering belongs in server snapshots so clients only receive nearby players, NPCs, and nodes.
- CraftPix source archives live under `assets/source/craftpix`; curated runtime PNGs stay in `assets`.
- The demo uses CraftPix-derived placeholders for readable proof, not final RPG art direction.
- The world model should stay legible as six design buckets: starter zone, gathering zone, elite zone, hub, party instance, and private instance.
- Ability acquisition is intentionally mixed: default attack on join, trainer/quest utility, challenge mobility, elite crowd control, and boss ultimate. This keeps the proof closer to MMO progression than a flat ability bar.
- Item categories should remain conceptual unless persistence expands: tools, consumables, gear, gathered resources, and cosmetic/title rewards.
- Bestiary coverage matters more than raw monster count. Keep one readable role per hostile family: basic melee, fast flyer, slow bruiser, phase/armor enemy, ranged enemy, and elite pressure test.
- MVP combat depth now includes armored chargers, distance-keeping bombers, support healers, and dungeon add pressure so enemies create different decisions instead of only different health bars.
- Hub NPCs prove non-hostile replicated actors, quest affordances, trainer purchases, banking counters, and travel triggers. They do not yet prove dialogue trees, durable player trade, or production economy rules.
- Repeatable contract state gives long-run renown and mastery without turning the slice into a full account platform.
- Rotating live events give the room a shared objective without adding matchmaking, party credit, or account-wide event services.
- The client should keep one clear next goal visible, with the live event as a parallel route rather than a replacement for the quest chain.
- Quest state is a lightweight flag trail for replication and progression checks. Treat full quest scripting, party credit, and account-wide achievements as future product layers.
- SFX should stay event-driven from replicated state, not client-predicted, so audio remains tied to authoritative outcomes.
- Claim boundary matches [MMO readiness](../../docs/mmo-readiness.md): room/zone MMO-ish proof, not global MMO platform, live-service stack, or cross-shard world.

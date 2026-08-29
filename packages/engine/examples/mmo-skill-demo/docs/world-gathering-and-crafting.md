# World Gathering and Crafting

This is the living design note for gathering, crafting, material WHY, and node defense in the MMO Skill Demo. Update it in the same change whenever skills, materials, recipes, gathering validation, hazard behavior, or related world logic changes.

Related docs: `./docs/world-building.md`, `./docs/world-travel.md`, and `./docs/future-quest-ideas.md`.

Canonical sources: `./src/shared/skills.ts`, `./src/shared/materials.ts`, `./src/shared/recipes.ts`, `./src/server/gatheringEngine.ts`, `./src/server/hazardEngine.ts`, and `./src/server/craftingEngine.ts`.

## Auto-Update Rule

Treat this file as part of the feature contract, not a separate planning note.

Update this document when any of these change:

- A gathering skill is added, renamed, removed, or retuned.
- A material name, tier, level gate, spawn zone, faction alignment, hazard chance, or WHY lore changes.
- A recipe input, output, station, tier, effect, or synergy reason changes.
- Gathering validation changes, especially range, duration, tool gates, movement aborts, damage aborts, or XP awards.
- Hazard behavior changes, especially tier thresholds, warning packs, punitive anchors, focused aggro, or sound/readback cues.
- Faction, zone, quest, or travel docs change in a way that alters why materials belong where they do.

Keep this doc high level. Link to canonical data files instead of copying implementation details.

## Intent

Gathering should feel like entering a faction-owned ecology, not clicking neutral rocks. Every material answers three questions:

- Why does this material exist in this place?
- Who wants to exploit, protect, tax, destroy, or hide it?
- What does it combine with from other disciplines to create meaningful gear, tools, structures, vessels, or rituals?

Crafting should make the world network matter. Strong recipes require multiple gathering skills so players cross territory boundaries, interact with rival economies, and understand why rare materials have political value.

High-tier gathering should push back. Tier 3 and higher nodes can trigger defensive encounters. Tier 5 nodes can create punitive local anchors that must be destroyed, making rare extraction a combat and positioning problem instead of only a timer.

## Skill Roster

There are 16 gathering skills. Each has five material tiers, for 80 total gatherable materials.

| Skill | World Role |
| --- | --- |
| Lumberjacking | Harvests rigid living and dead wooden structures. |
| Mining | Harvests metal rock deposits and volatile ore seams. |
| Foraging | Collects delicate woodland plants, herbs, leaves, and berries. |
| Quarrying | Chisels architectural stone, slate, marble, basalt, and blocks. |
| Fishing | Hooks aquatic life, reef creatures, trench predators, and scale-fish. |
| Skinning | Recovers hides and pelts from defeated beasts. |
| Crop Harvesting | Reaps field crops, fibers, grains, and cultivated harvests. |
| Scavenging | Dredges debris, wreckage, gears, ribs, and broken machinery. |
| Essence Siphoning | Filters raw magical and environmental currents. |
| Apiculture | Extracts active hives, comb, wax, venom, jelly, and nectar. |
| Sap-Tapping | Draws amber, resin, tar, pitch, and living elixirs from plants. |
| Spore-Hunting | Reads and harvests mold colonies, fungi, caps, and cords. |
| Dredging | Sieves clay, silt, mud, slag, and seabed floor deposits. |
| Archaeology | Excavates fossils, seals, plates, scrolls, and relic authority. |
| Hunting | Sets tactical traps for meat, glands, horn cores, teeth, and hearts. |
| Gemology | Chips quartz, garnet, sapphire, diamond, and geode crystals. |

## Leveling Model

Gathering progression uses explicit exponential math from level 1 through 99.

XP required for next level:

`XPForLevel(L) = floor(100 * 1.12^(L - 1))`

XP awarded per successful gather:

`BaseXP(T) = floor(25 * 1.55^(T - 1))`

Tier gates:

| Tier | Required Level | Current Role |
| --- | ---: | --- |
| 1 | 1 | Starter economy, tutorial-safe extraction, low hazard pressure. |
| 2 | 20 | Local specialization, first meaningful faction trade value. |
| 3 | 40 | Mid-game resources, first warning defense packs. |
| 4 | 60 | Dangerous faction border resources, stronger warning pressure. |
| 5 | 80 | Legendary materials, punitive anchors, major recipe inputs. |

Design note: combat still has its own progression identity. Gathering XP is tracked per gathering skill and legacy Mining/Woodcutting readbacks are kept compatible for the current HUD.

## Server Gathering Flow

Gathering is server-authoritative.

1. The client requests an interaction with a resource node.
2. The server resolves the node material and skill.
3. The server validates player level, tool ownership, zone, depletion state, and range.
4. The server starts a duration meter based on the material tier.
5. Every tick, the server checks that the player remains in range, does not move away, and has not taken combat damage.
6. On completion, the server awards skill XP, grants material items, contributes local faction/world-event progress, and rolls node defense hazards.
7. If the player lacks level, lacks the required tool, targets the wrong node, moves too far, changes zone, or takes damage, the gather emits local floating feedback instead of failing silently.

This means high-tier extraction is a positioning commitment. The player has to hold the site long enough for the server to finish the action.

## Tool Gates

Tool gates are intentionally light but faction-readable. Starter Mining and Lumberjacking already work with existing tools; the other skills have named tool requirements so future vendors, quests, and faction rewards can expose them cleanly.

| Skill | Tool Identity |
| --- | --- |
| Lumberjacking | Training Hatchet or Iron Hatchet |
| Mining | Pickaxe |
| Foraging | No hard tool gate |
| Quarrying | Mason Chisel |
| Fishing | Fishing Rod |
| Skinning | Skinning Knife |
| Crop Harvesting | Sickle |
| Scavenging | Prybar |
| Essence Siphoning | Siphon Vial |
| Apiculture | Bee Smoker |
| Sap-Tapping | Tap Spile |
| Spore-Hunting | Spore Lens |
| Dredging | Dredge Pan |
| Archaeology | Field Trowel |
| Hunting | Trap Kit |
| Gemology | Gem Pick |

Future NPCs and rewards should give these tools from factions that naturally control the skill.

## Material Grid

Each row is one skill. Each column is one tier and level gate.

| Skill | T1 Lv1 | T2 Lv20 | T3 Lv40 | T4 Lv60 | T5 Lv80 |
| --- | --- | --- | --- | --- | --- |
| Lumberjacking | Pine Wood | Elder Birch | Sylvan Oak | Ghostwood | Heart of World-Tree |
| Mining | Copper Dust | Coal Shell | True Silver | Void Shard Ore | Astral Iron |
| Foraging | Bloodrose | Earthroot | Moonlily | Voidbloom | Eternity Leaf |
| Quarrying | Sandstone | Granite Slab | White Marble | Dark Basalt | Null-Geode Block |
| Fishing | Bitter-Tail | Silver-Gill | Tide-Eel | Abyssal Stalker | Leviathan Scale-Fish |
| Skinning | Raw Pelt | Crag Hide | Dire Leather | Shadow Pelt | Behemoth Hide |
| Crop Harvesting | Wild Flax | Rye Grain | Gossypium Cotton | Twilight Sky-Oats | Sun-Thread Fiber |
| Scavenging | Scrap Iron | Driftwood | Brass Gear | Airship Rib | Sunken Engine Core |
| Essence Siphoning | Ley-Sparks | Aether Drift | Void Mote | Astral Tear | Cosmic Shard |
| Apiculture | Honeycomb | Brood Wax | Guard Venom | Royal Jelly | Golden Nectar |
| Sap-Tapping | Pine Amber | Sweet Resin | Corrupted Tar | Void Pitch | Yggdrasil Elixir |
| Spore-Hunting | Puffball Cap | Phosphor Fungi | Glow-Spore | Death Cap | Mycelium Void-Cord |
| Dredging | River Clay | Deep Canal Silt | Brimstone Mud | Volcanic Slag | Deep Abyssal Clay |
| Archaeology | Fossil Chunk | Rusted Seal | Crypt Plate | Ancient Scroll | Seal of the Archon |
| Hunting | Game Meat | Musk Gland | Horn Core | Alpha Canine | Primal Heart |
| Gemology | Raw Quartz | Rose Garnet | Blue Sapphire | Void Diamond | Prism Geode Crystal |

## Faction and Zone Logic

Materials should stay aligned with the world map instead of acting like generic loot.

Runtime gatherables now use tiered local density. Tier 1 nodes are common enough to be seen repeatedly inside their matching zones, tier 2 nodes are uncommon, and tiers 3 through 5 are sparse route or landmark finds. Overall source spacing and tier 1-2 route hints stay under the three-screen travel target, while the full map and minimap show gatherable pins so resource hunting starts as navigation and zone reading instead of blind wandering. The resource pin layer can be filtered from the minimap or the full-map legend when the player wants a cleaner travel read.

Forest and life materials belong mainly to Oakhaven, Ashwood Glade, and the wilderness. They should feel renewable but politically contested: the Sylvan Concord protects managed growth, the Verdant Outcasts claim raw survival rights, and industrial factions try to convert living systems into output.

Stone, ore, gems, coal, and slag belong mainly to Ironcrag, the Crags, high seams, and old volcanic routes. They should feel productive, dangerous, and infrastructure-heavy. The Vulcan Guild sees extraction as civilization; rivals see smoke, scars, debt, and militarization.

Fish, silt, salvage, engines, and deep clay belong mainly to Port Marrow, canals, wrecks, and abyssal waterways. These materials should connect movement, smuggling, pressure hulls, trade routes, and maritime sovereignty.

Relics, marble, radiant crops, seals, scrolls, and sanctified materials belong mainly to Aetheria and Holy Reach. These materials should feel lawful, expensive, audited, and useful for cleansing or legitimizing power.

Desert cotton, sandstone, garnet, fossils, and bazaar debris belong to Canaan Desert and the Sunken Bazaar. These materials should feel appraised, taxed, resold, forged, or used to convert history into leverage.

Voidbloom, Void Shard Ore, Void Diamond, Mycelium Void-Cord, and other corrupted tier 4 or 5 materials belong around the Void Rift or dungeons. These materials should feel powerful, unstable, and morally disputed.

High-Reach and the Ascetics of Sky own altitude materials: Astral Iron, Blue Sapphire, Twilight Sky-Oats, Sun-Thread Fiber, Prism Geode Crystal, and preserved teaching relics. These should read as discipline, focus, wind, and restraint.

## Recipe Design

Recipes prove the value of multi-discipline gathering.

Rules for recipe maintenance:

- A recipe should combine at least two gathering skills.
- The station should make the craft identity obvious.
- The output should explain why those material properties work together.
- High-tier recipes should reveal faction stakes, not only bigger stats.
- If a recipe is visible but not fully runtime-supported, it should still teach world identity and future craft direction.

Current recipe families:

| Family | What It Proves |
| --- | --- |
| Armor | Hides, stone, fibers, gems, and void materials can convert ecology into protection. |
| Weapons | Metals, crystals, venom, horns, wood, and pitch combine into faction weapons and siege tools. |
| Tools | Gathering specializations can improve other gathering and exploration loops. |
| Consumables | Food, jelly, spores, roots, leaves, and fish turn territory into survival prep. |
| Trinkets | Gems, relics, petals, seals, and essence make small items with strong identity. |
| Structures | Blocks, engines, banners, pylons, and root materials make faction infrastructure. |
| Vessels | Hull plates, keels, compass parts, and sea materials connect crafting to travel. |
| Rituals | Scrolls, seals, void inputs, and cosmic materials turn crafting into ideology. |

Required example recipes:

| Recipe | Main Inputs | WHY |
| --- | --- | --- |
| Void Resistance Cloak | Voidbloom, Shadow Pelt, Astral Tear | Void flora absorbs rot, shadow hide hides the wearer, and astral essence stabilizes the cloak against rift exposure. |
| Prismatic Siege Blade | Astral Iron, Prism Geode Crystal, Yggdrasil Elixir | Star metal gives mass, prism crystal splits wards, and living elixir repairs recoil damage from the blade. |
| Archon Purity Flask | Royal Jelly, Seal of the Archon, Glow-Spore | Jelly repairs tissue, the Archon seal authorizes cleansing, and glow-spore reveals hidden corruption. |

## Crafting Stations

Stations should feel like places with owners, not menus.

| Station Identity | Expected Use |
| --- | --- |
| Alchemist Lab | Flasks, antidotes, rot buffers, elixirs, purity work. |
| Apiary Press | Hive goods, nectar preservation, living wax, pollinator economy. |
| Archaeology Table | Relics, seals, tablets, codices, old authority. |
| Arbor Loom | Wood, fiber, robes, bows, living staves, rootcraft. |
| Dredge Kiln | Clay, mud, canal masks, hull plates, pressure materials. |
| Field Kitchen | Rations, bread, feasts, survival meals, battle food. |
| Forge | Ores, weapons, armor plates, tools, engine hearts. |
| Gemcutter's Bench | Focuses, rings, mirrors, lenses, precision crystal goods. |
| Harbor Still | Fish, brine, salvage, vessels, sea-route equipment. |
| Hunter Camp | Traps, trophies, hide gear, predator tools, primal rites. |
| Siege Yard | Heavy structures, bulwarks, charges, pylons, gates. |
| Spore Lab | Fungi, poison, masks, void-cord nets, hazardous biology. |
| Tannery | Pelt armor, cloaks, scale mail, saddles, hide reinforcement. |
| Void Crucible | Rift scripts, containment orbs, forbidden phase materials. |

## Hazard Engine

Hazards are node defense, not random punishment.

Tier behavior:

- Tier 1: safe enough for onboarding.
- Tier 2: mostly safe, but valuable enough to introduce local caution.
- Tier 3: warning hazards can spawn elite packs near the node.
- Tier 4: warning hazards get more serious and should feel like contested territory.
- Tier 5: punitive hazards can spawn a threat anchor near the player.

Threat anchors are destroyable local problems. They focus the harvesting player and can create repeat pressure until dealt with. The example identity is the Infinite Magical Hornet Nest for Apiculture, with Venomous Hornet pressure.

| Skill | Warning Defense | Punitive Defense |
| --- | --- | --- |
| Lumberjacking | Bramble-Beast pack | Heart of World-Tree Ward |
| Mining | Sapper-Goblin pack | Vulcan Sentinel |
| Foraging | Ash Bramble Stalker pack | Voidbloom Bramble Crown |
| Quarrying | Fissure-Skitterer pack | Null-Geode Warden |
| Fishing | Tide-Stalker pack | Leviathan Scale Anchor |
| Skinning | Moss-Grizzly pressure | Behemoth Hide Totem |
| Crop Harvesting | Scavenger Jackal pack | Sun-Thread Scarecrow |
| Scavenging | Rust-Biter pack | Sunken Engine Core |
| Essence Siphoning | Rift-Leech pack | Cosmic Rift Anchor |
| Apiculture | Gloom-Weaver Spider pack | Infinite Magical Hornet Nest |
| Sap-Tapping | Aggro-Tree defense | Yggdrasil Elixir Font |
| Spore-Hunting | Mire Bomber pack | Mycelium Void-Cord |
| Dredging | Grave-Stalker pack | Abyssal Clay Maw |
| Archaeology | Ruins Archer pack | Archon Seal Obelisk |
| Hunting | Ashwood Alpha pressure | Primal Heart Effigy |
| Gemology | Prism-Golem pressure | Prism Geode Lens |

## Client Readback Goals

The client should help the player understand what happened without hiding the play space.

Good readback:

- Shows which node is being gathered.
- Fires a collection particle immediately when the gathering action starts.
- Shows progress during duration gathering.
- Shows why a gather failed or aborted: low level, missing tool, moved, damaged, out of range, wrong zone, wrong node, or depleted.
- Uses sound and transient effect cues when a hazard triggers.
- Keeps critical danger near the focal action, not only in a corner HUD.
- Makes tier 5 anchors visually different from normal mobs.

Avoid:

- Treating hazard spawns as unexplained random ambushes.
- Hiding gathering progress behind large panels.
- Letting text-only warnings carry critical danger information.
- Making failure feel like a stolen input when the server intentionally aborted the gather.

## Quest and World Hooks

Gathering should feed future quest arcs.

Examples:

- Oakhaven can ask the player to harvest living wood without overstripping groves, then defend a grove from industrial buyers.
- Ironcrag can require ore and quarry materials to stabilize shafts before deeper enemies appear.
- Port Marrow can use dredging, fishing, and scavenging to repair routes, salvage wrecks, and open sea contracts.
- Aetheria can demand legal relics, marble, and purity reagents before trusting the player near Void rot.
- The Sunken Bazaar can turn fossils, garnets, cotton, and seals into appraisal, debt, forgery, and smuggling hooks.
- The Obsidian Sanctum can offer powerful Void recipes that make the player choose between utility and corruption risk.
- Ashwood Glade can turn hunting, skinning, and primal materials into rank challenges.
- High-Reach can ask for wind, focus, and altitude materials as mastery proofs before route unlocks.

When adding a new material or recipe with quest potential, update `./docs/future-quest-ideas.md` with the throughline, location, factions, player action, payoff, and why it belongs.

## Maintenance Checklist

Before considering gathering or crafting changes done:

- Skill count still matches design intent.
- Each skill still has five tiers.
- Each material still has placement, faction conflict, and synergy WHY.
- Tier level requirements still match the intended 1, 20, 40, 60, 80 ladder.
- Recipes still require cross-skill input.
- Server validation still owns level, tool, range, zone, duration, and abort checks.
- Hazard triggers still match tier severity.
- Tier 5 anchors remain destroyable and readable.
- Tests and build still pass.
- This document and related world docs are updated where needed.

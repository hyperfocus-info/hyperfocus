# World Building

This file is the local world-bible snapshot for the MMO Skill Demo. Update it whenever faction identity, town relationships, creature roles, reputation rewards, crafting materials, or major world goals change.

Related high-level context: ./README.md, ./NOTES.md, and ./docs/world-travel.md.

## World Shape

The world is organized around eight towns or faction anchors. Each faction controls a zone, defines a way of surviving, and gives the player a different idea of what "good" means.

The shared world footprint is now doubled from the original compact layout while preserving relative faction distance. The expansion keeps the known route order intact but gives borders, approach roads, and far Void lanes enough space to read as travel instead of immediate town adjacency.

The setting is not a neutral map. It is a pressure network:

- Oakhaven and Ashwood Glade argue over whether nature should be protected gently or allowed to devour civilization.
- Ironcrag and Aetheria turn order, infrastructure, and output into power.
- Port Marrow and the Sunken Bazaar keep movement, trade, smuggling, debt, and relic appraisal alive.
- The Obsidian Sanctum rejects every stable settlement and treats the world as material for Void transformation.
- High-Reach Peaks stands outside most material conflict, pushing self-mastery and detachment.

The player moves through this network by earning trust, harvesting local materials, proving survival against local creatures, and deciding which faction values are worth strengthening.

## Town Safety And Borders

Town centers are intentionally packed with NPCs, service fixtures, civic silhouettes, and faction props. Each settlement should feel occupied before the player reads labels: banks, boards, vendors, guards, route handlers, shrines, and workstations cluster around the core.

Hostile shared-world spawns should stay outside the town safety ring. The current rule keeps hostile enemies more than one and a half screens from every town center, including the Obsidian Sanctum. The buffer is not empty safety by itself: each border needs visible reason in the world through guards, barriers, warning signs, terrain breaks, or patrol lore.

Town border reads:

- Oakhaven uses woven living fences, root gate watches, scout stalls, wells, warning signs, moss borders, and living wards.
- Ashwood Glade uses bone-lashed thorn fences, hunter gates, meat carts, pack warnings, and feral moss edges.
- Ironcrag uses slag-stone blast walls, ore-yard gates, quota boards, fuel carts, and overflow camp barriers.
- Aetheria uses radiant toll walls, inspection gates, code boards, tithe carts, and contraband checks.
- Port Marrow uses saltwood dock fences, oath gates, tide signs, salvage carts, and cargo-spill route reads.
- Sunken Bazaar uses contract fences, caravan toll gates, market wells, debt boards, appraisal carts, and rutted skimmer roads.
- High-Reach uses low-step stone barriers, wind trial gates, breath-form boards, tea carts, and outer updraft crystals.
- Obsidian Sanctum uses pressure walls, gravity stones, warning signs, gate lanterns, rot moat blooms, and failed shelter stones.

## Real Zone IDs

The expanded world now has real region zone identities instead of only lore-side town labels. Use these ids consistently when talking about faction placement, travel, quest ownership, and visual differentiation:

- `ashwood`: Oakhaven, Sylvan Concord, starter forest, Ash trees, wolves, Nature Core pressure.
- `crags`: Ironcrag, Vulcan Guild, volcanic quarry, ore routes, forge pressure.
- `port-marrow`: Port Marrow, Free Cove, deepwater port, travel, salvage, no-combat services.
- `holy-reach`: Aetheria, Archon Order, white stone citadel, radiant law, archives.
- `canaan-desert`: Sunken Bazaar, Dust Syndicate, arid ruins, vault trade, relic appraisal.
- `void-rift`: Obsidian Sanctum, Nihil Sect, rift gate, Void rot, endgame pressure.
- `ashwood-wilderness`: Verdant Outcasts, deep primeval forest, feral hunting grounds.
- `whisperwind-ascent`: High-Reach Peaks, Ascetics of Sky, cloud temples, wind paths.
- `dungeon`: instanced boss space for relic checks, support adds, power nodes, and party pressure.
- `cottage`: private rest space for banking, innkeeping, storage, recovery, and social staging.

Some expanded zones still share legacy runtime affordances with older zone bands. Treat that as compatibility plumbing, not lore truth. `holy-reach` is its own Aetherian citadel even when older travel or catalog paths still treat it near Port Marrow. `canaan-desert` and `void-rift` are distinct even when older elite-zone logic still uses Bazaar-shaped pressure. `ashwood-wilderness` and `whisperwind-ascent` are real faction zones even when their terrain still borrows forest or crag affordances.

## Runtime Integration Targets

The expanded world architecture should surface through existing runtime paths before new systems are invented.

Expanded faction data should remain visible through catalog and UI surfaces so players can inspect faction identities, relationships, zones, and reward themes without needing external notes.

Reputation and materials should continue to grow through the current inventory, quest, renown, reward, vendor, and crafting-adjacent loops first. New mechanics should start as small extensions of existing play goals, drops, unlocks, and readbacks before becoming standalone faction or economy systems.

New map anchors should preserve current world-zone constraints when older systems still depend on them. If a faction or creature belongs to a newer location whose terrain, spawns, or quest content is not fully built out, expose it as catalog data, quest flavor, a travel hint, or a constrained encounter inside a compatible zone rather than pretending the whole region is complete.

Runtime integration should keep the playable slice coherent: one reachable next goal, visible progress cues, direct browser playability, and no cross-game coupling.

World-travel rules live in ./docs/world-travel.md. Keep this file focused on faction identity, world shape, ecology, and progression meaning; use the travel doc for physical networks, route gates, transit costs, and maintenance triggers.

## Faction Questlines

Faction questlines should make each faction's desire playable. They can begin as manifest entries, dialog hooks, contracts, crafting hand-ins, or reputation gates before becoming full bespoke chains.

Current core quest spine:

- Oakhaven starts the player with `first-cut`, `second-cut`, `wolf-culling`, and `final-cut`. This chain teaches harvesting, local combat, movement unlocks, road security, and the idea that the forest is both home and threat.
- Ironcrag continues with `heavy-lifting`. This turns ore banking, tool access, and mining output into the player's first industrial obligation.
- Void pressure is represented by `silent-sands`. This asks the player to survive hostile elite terrain long enough to unlock stronger defensive response.
- Repeatable contracts currently stand in for longer faction errands. Ashwood hunts, crag patrols, bazaar sweeps, dungeon writs, and cottage restock loops build renown, faction reputation, and rare-material identity.

Intended faction questline arcs:

- Sylvan Concord: heal corruption lines, protect provisions, recover Nature Core trust, then choose how much civilized tool use the forest can tolerate.
- Vulcan Guild: stabilize shafts, expand productive routes, refine prism deposits, then confront whether output is worth ecological damage.
- Archon Order: recover scripts, purge taint, audit heresy, then decide whether law protects the world or hardens it into a prison.
- Free Cove: reopen sea and land routes, secure salvage rights, break blockades, then choose oath-bound freedom over institutional control.
- Dust Syndicate: appraise relics, settle debts, move contraband, then decide whether every belief and artifact can be priced.
- Nihil Sect: bargain for Void tools, endure rot, expose rift doctrine, then decide whether transformation is enlightenment or annihilation.
- Verdant Outcasts: prove strength through hunts, read wild signs, earn pack tolerance, then decide whether nature should protect civilization or consume it.
- Ascetics of Sky: complete motion trials, recover archived memory, master altitude routes, then decide whether detachment is service or escape.

Questline writing should keep one reachable next goal visible during play. Long faction arcs should be readable as local work before they become ideology.

## Recipe Picker

Crafting now has recipe identity and a compact Craft panel. The player can inspect world recipes, read station and faction identity, compare inputs and outputs, and send a selected recipe id to nearby runtime stations that support that output.

Current behavior is hybrid. Supported station routes use the chosen authored recipe id and map it onto the existing runtime craft action. Unsupported future recipes remain visible for planning and faction identity, but are inspect-only until their station behavior exists. If no selected recipe can be mapped or crafted, station interaction still falls back to the older first-valid behavior.

Recipe picker intent:

- Show available recipes by station and faction: forge, alchemist lab, merchant vault, cursed statue, arbor loom, holy archive, harbor still, hunting camp, mountain shrine, and void crucible.
- Put craftable recipes before blocked recipes, but keep blocked recipes visible with missing material, gold, health, reputation, uniqueness, unsupported station, or distance reason.
- Read each recipe as a faction choice: what it consumes, what value system it reinforces, what reputation it grants, and whether it creates gear, consumables, conversion value, or future upgrade parts.
- Keep the panel compact and usable during play. Recipe choice should not bury the active quest, inventory pressure, or nearby interaction target.
- Prefer existing inventory, bank, quest flag, vendor, and reputation surfaces over a separate economy screen.

Representative recipe groups:

- Oakhaven turns forest remedies, sap, flour, hide, bark, and route markers into healing food and soft movement gear.
- Ironcrag turns ore, coal, chitin, prism shards, and forge fuel into tools, ingots, armor, and weapon rebuilding.
- Aetheria turns silk, quartz, scripts, emblems, brass, and sealing wax into focus and radiant upgrade components.
- Port Marrow turns brine, leaves, rum, eel hide, and tide scales into speed supplies and cloak routes.
- Sunken Bazaar turns debt, antiques, stamps, and relic containers into coin, appraised value, and profit charms.
- Obsidian Sanctum turns ash sludge, Void seed shells, tears, and Void plate into dangerous rift gear and cursed items.
- Verdant Outcasts turn thorns, claws, hunt skulls, blood, bitter roots, and spores into retaliation and low-health aggression tools.
- High-Reach turns feathers, wind sigils, and sage tea into movement mastery wraps.

## Visual Differentiation

World visuals should let the player read faction territory before reading text. Shape, contrast, placement, and motion should carry identity before palette alone.

Recent visual research reinforced three production rules for this map: protect gameplay readability before decoration, keep store-bought assets cohesive through shared scale and palette control, and make random travel space carry local texture instead of blank tinted fields. The current terrain pass applies those rules with per-zone ground, road, and water palettes; small deterministic texture motifs; and denser but still low-priority biome props that support landmarks without covering combat space.

Zone visual goals:

- `ashwood`: living greens, woven tree homes, soft paths, water-mill food cues, visible tree and wolf pressure.
- `ashwood-wilderness`: denser silhouettes, bone markers, thorn borders, predator trails, less civilized path language.
- `crags`: dark rock, orange heat, ore seams, furnace geometry, slag pools, scaffolded industrial order.
- `whisperwind-ascent`: high contrast sky gaps, thin paths, wind marks, pale stone, vertical route language.
- `port-marrow`: docks, ropes, salvaged hull forms, wet boards, storage crates, ship-route signals.
- `holy-reach`: white stone, gold law marks, geometric patrol lines, archive motifs, clean hostile symmetry.
- `canaan-desert`: dusty vaults, canyon tents, coin/scale motifs, wells, relic tables, contract signage.
- `void-rift`: black obsidian, purple stellar dust, gravity-well framing, broken silhouettes, unstable portals.
- `dungeon`: mirrored or corrupted subspaces tied to current relic objective, not generic caves.
- `cottage`: small private utility space, low noise, storage clarity, rest and recovery cues.

Creature visuals should echo idle behavior. Spiders need bridge and thread reads. Soot-Crabs need shell-polish and slag reads. Sentinels need strict pathing. Wraiths need gold-touch greed. Rift-Leeches need drifting absorption. High-Peak Eagles need thermal motion. These are gameplay readability hooks, not decoration.

Current runtime world art uses curated Craftpix image landmarks, dominant silhouettes, sub-town clusters, service fixtures, and low-density biome props around faction territory. Oakhaven now centers on an oversized World Tree, woven council shelters, root-rite grove trees, deer-idol paths, forage, provisions, scout markers, living wards, fences, gates, wells, and guard stalls, with route, ward, moss, and scout-blind reads pushed east so the forest border feels used instead of all services crowding the town core. Ashwood Wilderness separates itself with larger predatory tree massing, dragon and wolf idols, Timber-Goliath signs, thorn-wall trees, mushrooms, hunt boundaries, hunter camp reads, thorn fences, and hunter gates. Ironcrag now reads through a wider guild hall, blast gates, furnace-fire strips, foreman banners, cracked forge ground, quota offices, forge yards, heat vents, prism seams, stone barriers, and ore-yard guard gates. Aetheria leans harder into chapel height, radiant altars, candelabra, statue rows, law monuments, archive plinths, tithe stalls, purifier gates, blue ward crystals, toll walls, inspection gates, and contraband checks. Port Marrow reads through larger dock markets, salvaged hull houses, crane/tower silhouettes, layered water boards, broker stands, cargo piles, smuggler tables, navigator kiosks, dock fences, and oath gates. The Sunken Bazaar reads through enlarged vault buildings, subterranean vault towers, market rows, Golden Scales decor, cactus/well edges, palms, relic crystals, debt booths, appraisal tables, contract fences, caravan toll gates, and blocked vaults, while shade, Sunken Spire debt, and seal reads now extend toward the Void approach as a market enforcement edge. Obsidian Sanctum is more architectural, with a cave gate, obsidian cell, ritual floor, hive tower, cursed bargain skeletons, elixir lanterns, transmutation beds, pressure walls, gravity stones, warning signs, and violet crystals. The Void Rift stays more unstable through violet crystals, rift blooms, broken crossings, failed shelters, warning signs, debris, portal waymarks, support camps, and multiple far crossing pockets that make the eastern rift read as lethal travel space rather than unused map. High-Reach reads through taller pale ruins, wind gates, white trees, meditation courts, sky archives, wind libraries, low-step stone barriers, trial gates, tea carts, and an eastward cliff-step read that starts implying a longer ascent route.

The latest distribution loop raised the world density read from 179.18 to 222.23 while preserving sparse Void as dangerous distance. The added density comes from barrier props, service NPCs, support camps, tiered gatherables, water hazards, rock obstacles, and chained Void waymarks rather than one large settlement copied across the map.

Gatherables should now read as a real ecology layer. Common materials are visible throughout their home zones, uncommon materials appear less often, and rare materials sit on route edges, landmarks, or pressure pockets. The map and minimap support this by showing gatherable pins rather than making players sweep blank ground, and the resource layer can be filtered when route or combat readability matters more than foraging.

The five-pass progression loop adds a rootway forager hut outside the crowded starter forest, a far High-Reach aery edge, and three staged Void route reads: shelter, gravity pull, and bloom spread. These are small visual anchors for mastery pacing. The player should read where a short errand becomes border risk, where wind discipline becomes travel proof, and where far Void survival changes from shelter use to route reading to corruption study.

The follow-up gate readback loops connect those anchors to daily faction work. Soft-root gathering, mill protection, thicket diplomacy, labor logistics, slag ecology, archive handling, courtyard formation, reef scouting, oath debt, black-current responsibility, open-ledger contract work, prism seam mapping, vault echo appraisal, price stabilization, controlled Void exposure, Void bargaining, radiant border prep, boundary reading, pack law, far Void pressure, goliath wake control, first-breath preparation, thermal-line discipline, and mirror discipline now explain what proof the player is earning and what route, recipe, or mastery payoff that proof can later support.

Support NPCs now get planted visual fixtures tied to their service role. Merchants get stalls or counters. Crafting NPCs get forge or workstation props. Travel NPCs get signs, towers, or route markers. Banks, contract boards, trainers, hidden shrines, and cursed statues get compact fixtures and service badges. These props are render-only dressing; they do not change quest, vendor, crafting, bank, or travel behavior.

The enemy-camp density pass adds a visually distinct combat-attractor chain instead of one repeated tent language: wolf den, bramble barricade, sapper crater, rat cache, contraband wreck, crusader relic, sentinel drill camp, eagle watch, jackal bone camp, leech sink, warning bivouac, rift lamp, gargoyle gate, violet crystal, gravity leech cairn, rot bloom, failed bones, crawler burrow, amalgam scar, and oracle tower. Each camp pairs a landmark read with a nearby creature congregation so long travel lanes keep producing local danger, ecology, or faction pressure before the player can cross several screens of empty ground.

Screenshot coverage exists for the major outdoor areas through `bun.cmd run screenshot:world`. The capture route uses the same browser client with a hash-based area camera override, so it can inspect Oakhaven, Overgrown Thicket, Ashwood Glade, Ironcrag, Deep Fissure, Aetheria, High-Reach Peaks, Port Marrow, Sunken Bazaar, Sunken Spire, Void Rift, and Obsidian Sanctum without requiring gameplay travel.

This is visual world flesh, not a full biome renderer. The map still uses shared terrain tiles and faction washes underneath the curated objects. Current tests expect every screenshot-covered area to have at least one dominant silhouette, several unique landmark assets, service reads, and a dense enough landmark cluster to read from camera distance. Bespoke per-zone tilemaps and full custom architecture sets remain future work. Animations are not required for the current world-building target.

### Confirmed Landmark Readback

Recent visual confirmation shows the following runtime reads on screen:

| Area | Primary landmarks | Service and edge reads |
| --- | --- | --- |
| Oakhaven | Oversized World Tree, woven elder shelter, luminous Nature Core tree, root-rite grove, deer-idol path | Miller provisions, forage stall, scout route marker, crafting shelter, living ward, living fence, root gate, well, guard stall |
| Overgrown Thicket | Wolf idol, luminous corruption tree, predator dragon idol, thorn-wall tree, mushroom edge | Scout blind, spore-edge danger, corruption route read, rootway forager hut, wolf den camp |
| Ashwood Glade | Predatory tree mass, dragon idol, wolf idol, Timber-Goliath sign, planet-call tree | Hunt boundary, thorn camp edge, hunter camp marker, thorn fence, hunter gate, pack warning, bramble ambush camp |
| Ironcrag | Wide guild hall, blast gate, furnace-fire strip, cracked forge ground, foreman banners | Blacksmith yard, quota office, geologist claim, heat vent, prism seam, blast wall, ore-yard gate, sapper crater camp |
| Deep Fissure | Yellow crystals, widened fissure mouth, open heat seam | Field forge, sealed shaft, geologist marker, overflow barrier |
| Aetheria | Tall chapel facade, radiant altar, candelabra, statue row, law monument, blue crystals | Archive desk, tithe stall, purifier gate, ward marker, law plinth, toll wall, inspection gate |
| High-Reach Peaks | Taller pale temple ruins, wind gate, white tree, meditation court, blue crystals | Sky archive, wind library, wind-leap marker, cliff step, sage stall, low-step barrier, trial gate, aery edge |
| Port Marrow | Larger dock market, salvaged hull house, crane tower, layered water boards | Broker stand, cargo pile, smuggler table, navigator kiosk, dock fence, oath gate |
| Sunken Bazaar | Enlarged vault building, subterranean vault tower, market rows, Golden Scales decor, palms | Debt booth, appraisal table, blocked vault, cactus/well edge, relic scale, contract fence, toll gate |
| Sunken Spire | Blue-gray ruins, yellow seal fragments, blue mirror crystal, debt scale | Relic salvage table, vault seal, dungeon danger read |
| Void Rift | Violet crystal, rift bloom, broken crossing, warning sign, rift debris | Portal waymark, failed-crossing danger, unstable edge read, failed shelter, support camp, gravity relay, bloom spread warning, leech sink, gargoyle gate, gravity leech cairn, failed bones, crawler burrow, amalgam scar, oracle tower |
| Obsidian Sanctum | Void cave gate, obsidian cell, ritual floor, hive tower, skeleton, lanterns, violet crystals | Zora elixir stall, cursed bargain, transmutation bed, pressure wall, gravity stone, rot moat |

## The Eight Factions

### Oakhaven: The Sylvan Concord

Oakhaven is the starter forest town in Ashwood Glade. It believes in primal preservation, ecological symbiosis, and complete neutrality of impact. Technology, extraction, and heavy mechanization are treated as infections that cut the life-blood of the World Tree.

Oakhaven survives through self-woven arbor-homes, symbiotic agroforestry, and domesticated forest flora. It is governed by an Elder Council and follows an animistic pantheon centered on the Nature Core as an active forest deity.

Its highest good is leaving no footprint on the living forest. Its greatest fear is the petrification of the wild into sterile, mechanical stone.

Key figures:

- Elder Rowan protects spiritual integrity and oversees the town.
- Miller Finn manages food stores through organic water-driven grain work.
- Scout Elara tracks corruption lines and defends the border.

Relationships:

- Allies: Verdant Outcasts, under strained biological kinship; High-Reach Peaks, through shared peace instincts.
- Enemies: Vulcan Guild, over timber and extraction; Archon Order, over authoritarian expansion.

### Ironcrag: The Vulcan Guild

Ironcrag is the volcanic quarry town in the Iron Crags. It believes the world is a dormant machine waiting to be fueled, hammered, measured, and structured by sapient labor.

Ironcrag survives in brick-and-mortar blast-furnace fortresses. Geothermal extraction supports mining, metal smelting, and heavy tool production. Food is imported through logistics agreements in exchange for advanced metalware.

Its governance is a technocratic oligarchy of foremen. It rejects mysticism in favor of physical force, durability, output, and thermal efficiency.

Its highest good is productive labor and lasting design. Its greatest fear is a frozen forge: structural stagnation that starves progress.

Key figures:

- Overseer Bale drives mining quotas and guild production.
- Blacksmith Silas fabricates steel, tools, and mechanical armor.
- Geologist Mira maps seismology, geodes, and prism deposits.

Relationships:

- Allies: Archon Order, through infrastructure and defense.
- Trade partners: Dust Syndicate, through equipment markets.
- Enemies: Sylvan Concord, over timber and excavation; Nihil Sect, over destruction of useful matter.

### Aetheria: The Archon Order

Aetheria is the white stone citadel of Holy Reach. It believes in divine structure, eternal law, radiant purity, and obedience to the Radiant Code. Biological mutability, individual drift, and social chaos are treated as crimes.

Aetheria survives in pristine marble towers supported by law-bound farms, indentured labor, tithes, and satellite settlements. Its theocratic High Arcanists rule through scripture, purity doctrine, and military enforcement.

Its highest good is obedience to written law and the purging of shadow. Its greatest fear is internal heresy that becomes structural collapse.

Key figures:

- High Arcanist Vael rules the order and wields the Solar Star.
- Inquisitor Joran judges dissidents and enforces spiritual discipline.
- Purifier Sarah commands frontline purges in tainted zones.

Relationships:

- Allies: Vulcan Guild, through infrastructure and law enforcement.
- Enemies: Free Cove, through active naval and ideological war; Nihil Sect, through spiritual and existential opposition.

### Port Marrow: The Free Cove

Port Marrow is the deepwater port faction. It believes in radical individual liberty, maritime merit, personal oaths, gold payment, and survival by speed, nerve, and wit.

Port Marrow is built from wooden walkways, salvaged hulls, and ocean docks. It survives through naval trading, reef salvage, smuggling, private storage, and deep-sea hunting.

It is ruled by a shifting Captain's Council where disputes are settled by duels, purse weight, or reputation. Its gods are unpredictable sea powers rather than fixed law.

Its highest good is freedom kept through fulfilled oaths. Its greatest fear is institutional capture: chains, taxes, and lawful execution.

Key figures:

- Captain Marrow acts as harbor warden and informal council voice.
- Navigator Kai charts anomalies, currents, and sea routes.
- Runner Kael coordinates land smuggling and fast route work.

Relationships:

- Allies: Dust Syndicate, through trade and smuggling.
- Enemies: Archon Order, through active naval war and anti-authoritarian resistance.

### Sunken Bazaar: The Dust Syndicate

The Sunken Bazaar is the desert and ruin market of Canaan. It believes in mercantile pragmatism: beliefs are assets, order is useful when contracts need stability, and chaos is profitable when assets can be liquidated.

The Bazaar survives in subterranean vaults, canyon tents, deep wells, and trade routes. Exotic meats, relics, perfumes, mounts, antiques, debts, and appraisal services are its core lifeblood.

It is governed by a Merchant Cartel. Its patron is the Golden Scales, a god of fair trade, wealth, and enforceable terms.

Its highest good is net profit, liquidity, and honor inside contract language. Its greatest fear is frozen trade, blocked routes, and currency collapse.

Key figures:

- Broker Rex holds the ledger of debts.
- Merchant Lynd supplies exotic armor plates and mounts.
- Appraiser Chloe evaluates relics and historical goods.

Relationships:

- Allies: Free Cove, through smuggling and trade.
- Trade partners: Vulcan Guild, through equipment markets.
- Enemies: Nihil Sect, because dissolution destroys material value.

### Obsidian Sanctum: The Nihil Sect

The Obsidian Sanctum surrounds the Void Rift. It believes in decay, acceleration, cosmic transformation, and the end of mortal individuality. To the sect, growth only comes from the Void, and mortal matter should be dissolved into immortal cosmic form.

The Sanctum survives in black obsidian geometries hovering around a gravity well. Void essence, decay transmutation, rift whispers, and dark alchemy replace normal food and settlement life.

It is governed by a Hive Collective guided by Void Scholars. Individual identity is treated as temporary material.

Its highest good is accelerated convergence toward the end of existence. Its greatest fear is eternal equilibrium, where nothing changes, rots, or transforms.

Key figures:

- Alchemist Zora synthesizes mutated elixirs and Void gear.
- The Cursed Statue trades power for life force.
- Acolyte Lyros guards the Rift gateway.

Relationships:

- Allies: none.
- Enemies: all other factions, because the sect sees them as biological matter waiting to be processed.

### Ashwood Glade: The Verdant Outcasts

Ashwood Glade is the deep primeval wilderness faction. It shares roots with Oakhaven but rejects its restraint. The Outcasts believe nature should dominate cities, devour the weak, and reclaim territory through tooth, thorn, and hunger.

The faction survives as nomadic hunter-gatherers in mobile leather camps. They hunt massive creatures, consume raw forest meat, and wear bone armor.

Shamanistic elders interpret planetary calls and blood rites. Strength, instinct, and territory are their moral language.

Their highest good is primal dominance and proven physical power. Their greatest fear is becoming soft, domesticated, and civilized.

Key figures:

- Shaman Corvus preserves blood rites and wild doctrine.
- Hunter Keera commands beasts and pack tactics.
- Thorne the Wild defends hunting boundaries.

Relationships:

- Allies: Sylvan Concord, through strained natural kinship.
- Enemies: Vulcan Guild and Archon Order, as agents of extraction, law, and domestication.

### High-Reach Peaks: The Ascetics Of Sky

High-Reach Peaks is the cloud-temple faction of Whisperwind Ascent. It believes in non-duality, self-mastery, spiritual detachment, and the body as a mirror of the inner world.

The Ascetics live in mountain temples reached by flight paths, wind leaps, or dangerous climbing. They survive on condensed clouds, high-altitude mosses, and solar ritual.

Their governance is a strict meritocracy guided by enlightened masters. Material rank matters less than discipline, balance, and demonstrated control.

Their highest good is mental command, emotional balance, and physical excellence. Their greatest fear is surrender to base instinct and uncontrolled desire.

Key figures:

- Master Kael trains advanced motion and discipline.
- Monastic Scholar Jin guards ancient global archives.
- Guardian Tariq protects the high steps.

Relationships:

- Allies: Sylvan Concord, through peace and restraint.
- Enemies: Dust Syndicate, because greed binds the soul; Nihil Sect, because decay is false transcendence.

## Relationship Map

The faction web is built around five conflicts:

- Nature against industry: Sylvan Concord and Verdant Outcasts oppose Vulcan extraction, though the Concord wants balance and the Outcasts want domination.
- Law against liberty: Archon Order and Free Cove are locked in religious, military, and naval conflict.
- Value against dissolution: Dust Syndicate, Vulcan Guild, and most towns reject the Nihil Sect because Void decay destroys goods, bodies, contracts, and history.
- Peace against appetite: High-Reach Peaks and Oakhaven prefer restraint, while the Outcasts, Guild, Cove, and Bazaar each define survival through stronger forms of appetite.
- Order against mutability: Aetheria seeks fixed purity, while nature, sea, trade, and Void forces all change too quickly to fit its doctrine.

These relationships should shape quest text, reputation gates, town services, enemy placement, and reward flavor.

## Bestiary Concept

Creatures are not random combat targets. Each one should express a local ecology, labor problem, spiritual pressure, or faction belief.

Forest creatures include canopy spiders, bramble predators, spore pods, Timber-Goliaths, wolf packs, and Ashwood Alphas. They should feel territorial, camouflaged, regenerative, and tied to the question of whether nature heals or consumes.

Iron Crags creatures include Soot-Crabs, fissure skitterers, Rust-Biters, Calamity-Bats, Prism-Golems, Sapper-Goblins, and Lava-Spit Slimes. They should feel like mining hazards, slag eaters, seismic cleaners, powder thieves, and living pressure inside industrial systems.

Aetheria creatures include Spire-Sentinels, Aether-Drifters, and Anointed Crusaders. They should move with geometric discipline, divine fire, patrol logic, and ceremonial violence.

Port Marrow creatures include Grave-Stalkers, Tide-Stalkers, Marrow-Cove Rats, and Abyssal Eels. They should read as dockside scavengers, reef ambushers, graveyard feeders, and deepwater predators.

Sunken Bazaar creatures include Void-Lepers, Tallow-Wraiths, Ruins Archers, and Scavenger Jackals. They should express greed, exile, ancient debt, desert hunger, and trade routes haunted by old value.

Void Rift creatures include Rift-Leeches, Void-Gargoyles, Void-Crawlers, Cursed Oracles, and Void-Amalgams. They should feel unstable, cosmic, parasitic, prophetic, and hostile to ordinary matter.

Dungeon creatures include Crystalline Striders and Dungeon Harvesters. They should preserve, sort, mirror, or repurpose old dungeon remains rather than act like ordinary wildlife.

High-Reach creatures include High-Peak Eagles and Moss-Grizzlies. They should express altitude, discipline, endurance, and a mountain ecology where survival is calm but unforgiving.

Each creature should have a non-combat idle behavior. Idle behavior is part of world truth: spiders build bridges, crabs polish shells, sentinels patrol in timed lines, wraiths finger gold, and leeches drift through stellar dust.

## Reputation Progression

Faction reputation has five tiers: Neutral, Recognized, Trusted, Respected, and Exalted.

Each faction should grant four meaningful reward bands after Neutral. Rewards should reveal faction identity before raw power.

Oakhaven rewards forest access, off-road movement, forest regeneration, and reduced beast aggression. Its progression says: the forest accepts you.

Ironcrag rewards smelter access, fuel efficiency, fire-ground immunity, and armor penetration. Its progression says: the forge outfits you.

Aetheria rewards sanctuary archive access, Void and dark resistance, holy merchant discounts, and radiant smite effects. Its progression says: the law shields and judges through you.

Port Marrow rewards private docks, shoreline and ship speed, black-market brokerage, and health steal on critical hits. Its progression says: freedom pays back daring.

The Sunken Bazaar rewards backroom relic trade, lower transaction fees, better merchant sale value, and higher raw gold drops. Its progression says: every relationship is a contract.

The Obsidian Sanctum rewards dark portal access, Void-rot resistance, spell critical power, and cooldown recovery on kills. Its progression says: decay becomes mobility and power.

Ashwood Glade rewards hunter tracking, reduced elite wolf detection, thorn retaliation, and low-health feral speed. Its progression says: the wild recognizes strength.

High-Reach Peaks rewards wind path access, fall damage reduction, lower mana costs, and double-jump movement. Its progression says: discipline frees the body.

## Crafting Material Economy

The material economy has three layers: physical chassis materials, enhancement materials, and general loot.

Weapon and armor essentials are tangible building blocks. They include simple ores, softwoods, slate, quartz, hides, refined ingots, heartwood, obsidian, spider silk, steel plate, bone, leather, prism alloy, thorn vine, fireproof carapace, silver-steel, sinew, aether-brass, void plate, sapwood, aquatic scales, eel hide, peak feathers, claws, and lava cores. These should make gear feel made from real local bodies and terrain.

Enhanced materials are identity-bearing upgrades. Radiant emblems, Void tears, druidic seed-pods, core sparks, brine oils, wind sigils, debt stamps, ancient scrolls, gargoyle cores, and mirror shards should change weapons, armor, or skills in ways that match their faction source.

Harvested resources form the ordinary economy. Metal dust, clinker, coal, sandstone, bark, sap, bramble, cactus pulp, shells, geodes, sulphur, clay, pebbles, oats, moss, herbs, flowers, poison plants, leaves, and glowing mushrooms give the world basic trade texture.

Monster drops carry ecological proof. Teeth, membranes, chitin, grave dust, wraith residue, bones, venom, claws, beaks, jelly, gargoyle dust, ghost wax, seed claws, acid, talons, spore dust, oracle remains, abyssal teeth, prism crystals, and Void mandibles should connect combat to crafting without feeling like generic trophies.

Faction and quest rares express social belonging. Oak leaves, wage tokens, tax bundles, salvage boxes, antique bottles, ash sludge, hunt skulls, jade stones, elderwood ash, forge coke, sealing wax, smuggled rum, debt notes, portal keys, blood vials, sage tea, dungeon hardware, mirror glass, candle cores, fuses, scale maps, route markers, flour, eyeglasses, and Void seed shells should point back to the faction or quest that produced them.

The economy should support faction fantasy:

- Oakhaven materials feel living, adhesive, restorative, and wooden.
- Ironcrag materials feel hot, metallic, heavy, and engineered.
- Aetheria materials feel pure, sealed, radiant, and archival.
- Port Marrow materials feel brined, salvaged, slippery, fast, and illicit.
- Sunken Bazaar materials feel appraised, dusty, contractual, and antique.
- Obsidian Sanctum materials feel unstable, draining, cosmic, and transformative.
- Verdant Outcasts materials feel bloody, thorned, feral, and territorial.
- High-Reach materials feel light, wind-cut, meditative, and precise.

## Player Arc

The expanded arc should remain practical and playable:

1. Learn survival through Oakhaven and the forest.
2. Discover that the forest conflict has both gentle and feral sides.
3. Enter Ironcrag and see the cost and value of industry.
4. Reach Aetheria and confront law as both shield and prison.
5. Use Port Marrow and the Bazaar to move, trade, smuggle, and appraise.
6. Earn reputation through faction-aligned tasks and material loops.
7. Turn creature ecology into crafting and gear identity.
8. Approach the Void Rift with enough alliances, tools, and resistance to survive.
9. Decide whether the world is preserved, structured, freed, sold, transcended, or dissolved.

## Remaining Boundaries

Current expansion is broad, but not yet a full MMO world.

Implemented or represented:

- Eight faction identities, real zone ids, anchors, NPC placement, and Codex visibility.
- Expanded creature, material, reputation, and recipe data.
- Reputation and material rewards through gathering, kills, contracts, events, and crafting-adjacent NPC interactions.
- Lightweight runtime effects for several reputation rewards where existing combat, movement, regen, mana, gold, cooldown, and aggro systems can support them.
- Real path links between faction anchors on the shared world map.

Still bounded:

- Some expanded zones still rely on older terrain bands, legacy zone compatibility, or sparse anchor placement.
- Faction questlines now exist as eight typed three-step faction arcs, but most still resolve through shared dialog, material, kill, survival, and reward plumbing rather than bespoke mission scripting.
- Recipe choice has a compact player-facing picker and supported station routing, but some future recipe groups remain inspect-only and older first-valid fallback still exists.
- Visual differentiation now uses tile washes, anchor labels, faction badges, creature palettes, glyphs, motifs, spawn composition, curated faction landmarks, sub-town clusters, service fixtures, and scattered biome props. Full bespoke biome tilemaps and complete faction architecture sets remain future work.
- Reputation rewards should stay legible and modest until each faction has enough authored quest and zone content to justify stronger identity-defining powers.
- New systems should not spill into shared engine or other games unless multiple entries clearly need the same primitive.

## Maintenance

When changing towns, factions, faction names, zones, NPC roles, relationships, creature ecology, reputation rewards, crafting materials, quest arcs, relics, live events, or boss motives, update this file in the same change.

Keep this file high-level. Describe intent, relationships, goals, economies, and player-facing meaning before implementation details.

When adding runtime support, keep faction visibility tied to catalog or UI first, route reputation and material rewards through existing inventory, quest, and renown systems first, and state whether each new zone is full terrain, legacy-compatible terrain, or catalog/quest representation.

When adding questlines, document each faction's player-facing desire before listing task steps. When adding recipe UI, document whether players can choose among valid recipes or whether interaction still crafts the first available valid recipe. When adding visual work, document what the player can read on screen and what remains placeholder.

When adding travel routes, route costs, movement unlocks, or faction-gated shortcuts, update ./docs/world-travel.md in the same change.

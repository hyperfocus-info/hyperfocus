# World Travel

This file is the travel-system design bible for the MMO Skill Demo. Update it whenever zone ids, faction anchors, travel NPC roles, route gates, reputation unlocks, or travel UI behavior change.

Related context: ./README.md, ./docs/world-building.md, ./src/data/world.ts, and ./src/data/world-reputation.ts.

## Intent

Travel should make the world feel physical, factional, and costly. The player should not vanish from anywhere to anywhere. Long movement should start at a visible hub, pass through a faction-owned network, and reveal who controls the route.

Current runtime travel is still a compact proof: Captain Marrow can route players between major anchors, Runner Kael and Navigator Kai can escort nearby moves, and some Void routes require readiness. This document describes the intended expanded travel design that future runtime work should converge toward without breaking the playable slice.

Recent world dressing doubles the shared-map footprint while preserving the old route order. Towns now have more breathing room, hostile shared-world spawns stay more than one and a half screens from town centers, and border props show why each settlement is defensible instead of simply empty.

The far Void route now has a chain of waymarks, support camps, failed crossings, gravity stones, eye-growth samples, water hazards, and debris beyond the Obsidian Sanctum. The latest route pass clarifies that chain into shelter, gravity-pull, and bloom-spread beats. These are visual route seeds, not full travel endpoints yet. They exist to make premium Void movement feel dangerous before route choice grows into a broader system.

Gate readback passes make route-adjacent daily work name its proof before travel expands. Oakhaven field work points toward rootway errands, Port Marrow oath, reef, and black-current work point toward private dock trust plus owned route responsibility, Bazaar ledger and price work point toward contract-stable desert routes, High-Reach first-breath, thermal, and mirror discipline point toward glider plus dungeon-route composure, and far Void work points toward portal cost, shelter, pull, and rot-study route mastery.

Enemy camp density now supports travel readback: each long lane should surface a camp, landmark, or creature attractor before several screens pass empty, with the far Void route escalating from leech sinks through gravity and failed-bones pockets to crawler burrows, amalgam scars, and oracle towers.

## Core Principles

Physical continuity comes first. Fast travel is never a free menu action from the field. Players reach piers, stables, shrines, aeries, rail yards, root gates, or portal markers before they can use a network.

Faction friction shapes route access. Enemy factions do not share networks by default. Crossing from Oakhaven to Ironcrag should require dangerous overland travel, reputation work, or a neutral routing anchor such as Port Marrow or the Sunken Bazaar.

Environmental gates keep geography meaningful. High mountains, deep chasms, controlled citadel gates, open sea, desert exposure, and Void storms block ordinary paths until the player has the right faction trust, tool, escort, or material payment.

Travel should be readable in play. A route should communicate its owner, cost, risk, and destination before the player commits. The travel surface should keep one clear next goal visible and should not bury combat, quest, or survival state.

## Transit Networks

| Zone ID | Faction anchor | Native travel method | Spiritual or tech profile |
| --- | --- | --- | --- |
| `ashwood` | Oakhaven | Beast-Leap Paths and canopy swings | Organic, silent, low footprint. |
| `ashwood-wilderness` | Ashwood Glade | Hunter trails, blood-marked blinds, root-adjacent wild paths | Feral, territorial, strength-tested. |
| `crags` | Ironcrag | Ore-cart rails and steam-lifts | Mechanical, loud, high-heat. |
| `holy-reach` | Aetheria | Radiant lightways and citadel gateways | High-magic, pristine, rule-bound. |
| `port-marrow` | Port Marrow | Smuggler channels, skiffs, and private docks | Coastal, pirate-chartered, low-law. |
| `canaan-desert` | Sunken Bazaar | Kodo caravans and sand-skimmers | Mercenary, wind-driven, paid. |
| `void-rift` | Obsidian Sanctum | Unstable Void tears | Dangerous, unstable, draining. |
| `whisperwind-ascent` | High-Reach Peaks | Wind paths and glider aeries | Aerial, lightweight, focus-driven. |

## Network Rules

Faction-owned travel networks are local first. A trusted faction may move the player quickly inside its own territory before it ever grants cross-world reach.

Allied networks may hand off at shared boundary hubs. Sylvan Concord and High-Reach routes can share low-impact wilderness and wind logic. Free Cove and Dust Syndicate routes can share smuggling and trade logistics. Vulcan Guild and Archon Order routes can share infrastructure, tolls, and enforcement.

Enemy networks block direct service. Sylvan routes should not deliver players straight into Ironcrag without a contested pass. Aetherian gateways should not serve Free Cove smugglers. Nihil Sect routes should remain hostile to every stable settlement.

Neutral routing anchors should feel useful but compromised. Port Marrow can move people around laws for coin and oath. The Sunken Bazaar can move anyone who can pay or trade. Both should expose extra risk, taxes, debt, contraband checks, or ambush pressure.

## Reputation Unlocks

Earning trust opens physical shortcuts and alternate movement modes. Reputation should not simply reduce timers; it should reveal how that faction believes movement ought to work.

When route data becomes authored, each route should carry:

- A stable route id.
- Source and destination zone ids.
- A named physical hub or anchor.
- A gold, material, health, debt, or item cost.
- Faction reputation requirements.
- Risk notes such as ambushes, toll checks, Void rot, hostile guards, or cargo restrictions.

### Wind Glider Suite

Requirement: High-Reach Peaks, Trusted.

Players can leap from high mountain aeries in `whisperwind-ascent` and glide over deep chasms into lower coastal or citadel-adjacent zones without taking fall damage. This should feel like discipline and altitude mastery, not a generic flying mount.

Runtime alignment: this can grow from the existing High-Reach fall-damage and wind-path reputation rewards. The far aery edge now gives this unlock a visible practice line before it becomes a real travel option.

### Rootways

Requirement: Sylvan Concord, Respected.

Players can speak to ancient trees in `ashwood` and enter the root system, emerging in `ashwood-wilderness` or protected forest pockets. Heavy mechanized equipment, synthetic tools, and carried metal ore should block entry until removed or banked.

Runtime alignment: this should tie to forest reputation, Oakhaven route markers, and visible tree or shrine hubs before becoming a broad teleport.

The rootway forager hut extends the Oakhaven-to-Thicket path into a short-session border errand. It should teach that root routes begin as local trust and ecology reads before they become fast travel.

### Smuggler's Sinkhole

Requirement: Free Cove or Dust Syndicate, Trusted.

Players can use an underground route that avoids Aetherian taxes and guard hostility. Access requires a daily-changing passkey bought with smuggling wares, debt stamps, or contraband value.

Runtime alignment: this should begin as a Port Marrow or Sunken Bazaar route choice with explicit cost and Aetheria avoidance before adding daily passkey behavior.

## Premium Transit

The fastest networks should carry steep material, economic, social, or physical penalties. Premium travel should solve distance while creating a new decision.

### Aetherian Radiant Gateways

Method: instant travel between white stone citadels and sanctioned radiant shrines.

Cost: very high gold tolls plus a tax or seizure check on non-order goods.

Restriction: requires Respected status with the Archon Order. If the player carries corrupted Void items, the gateway shuts down and alerts nearby Templars.

Design read: the law protects clean travelers and punishes impurity.

### Sand-Skimmer Charters

Method: high-speed sail-cars crossing the dunes between Canaan waystations, Bazaar vaults, and coastal trade points.

Cost: Debt Stamps, pristine relics, or high gold fares.

Restriction: open to anyone, but fares double for players hostile with the Dust Syndicate.

Design read: anyone can move if the contract is profitable enough.

### Void Tear Rifts

Method: dangerous wormholes linking the Obsidian Sanctum to primal or distant zones.

Cost: raw player health and Void Rot accumulation, roughly a 50% maximum-health penalty for three minutes.

Restriction: anyone can step through, but hostile creatures camp exit nodes and unprepared players may arrive weakened.

Design read: decay becomes mobility, but the body pays first.

## Environmental Gates

Mountains and chasms should prefer High-Reach tools: wind paths, glider aeries, fall protection, or focus trials.

Dense living forest should prefer Sylvan and Outcast tools: rootways, scout route markers, beast tolerance, and hunter pathing.

Industrial barriers should prefer Vulcan tools: rail access, steam-lift permits, heat immunity, and ore-yard credentials.

Citadel barriers should prefer Archon tools: archive clearance, radiant purity, toll payments, and contraband inspection.

Sea and smuggling barriers should prefer Free Cove tools: docks, skiffs, captain maps, route oaths, and passkeys.

Desert barriers should prefer Dust Syndicate tools: caravans, skimmers, debt stamps, relic payments, and route insurance.

Void barriers should prefer Nihil or anti-Void preparation: portal keys, Void-resistant gear, rot resistance, and willingness to take exit-node pressure.

## Runtime Path

Travel implementation should grow in small, visible layers:

1. Keep current Captain Marrow, Runner Kael, and Navigator Kai behavior playable.
2. Add authored route records only after each route has a physical hub, readable cost, and destination label.
3. Show blocked route reasons before adding more route count.
4. Route reputation gates through existing reputation rewards and quest flags first.
5. Add premium penalties after the player can read and avoid them.
6. Keep long-route UI compact enough that active objective and nearby danger remain legible.

Do not turn this into a global MMO routing service until multiple examples need the same primitive. For now, travel remains local to this demo.

## Current Boundaries

Implemented or represented:

- Major faction anchors and zone ids exist in the local world data.
- Current route choices can send players to major anchor labels through Captain Marrow.
- Runner Kael and Navigator Kai can escort short nearby moves instead of teleporting.
- Void route readiness already checks for protective items, quest flags, or mastery.
- Travel NPCs and landmarks have visible route props in the world art pass.
- Town borders have visible barriers, guards, warning signs, and service camps before hostile territory resumes.

Still intended:

- Per-faction route records with costs, reputation gates, and blocked reasons.
- Separate physical network hubs for roots, rails, lightways, skiffs, caravans, rifts, and aeries.
- Cargo restrictions, contraband checks, passkeys, tolls, debt fares, and health/rot costs.
- Enemy-network denial and neutral hub rerouting.
- Player-facing premium transit warnings and arrival risk readback.

## Maintenance

Update this file in the same change when:

- A zone id, faction anchor, travel NPC, or route label changes.
- A quest, material, reputation reward, or item unlocks movement.
- Runtime travel adds a new destination, cost, escort, route gate, or blocked reason.
- World-building changes faction relationships that should affect route access.
- Travel UI changes what the player can see before committing to a route.

Keep this file high-level. Link to runtime data when useful, but describe player-facing travel rules, route meaning, and maintenance boundaries before implementation details.

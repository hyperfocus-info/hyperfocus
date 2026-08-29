# World Art Notes

Runtime world props live here. Source archives stay under `./assets/source/craftpix/`.

The current set is curated to make faction territory readable on the shared map:

- Forest and wilds: mega trees, woven shelters, deer/wolf/dragon idols, swirling trees, mushrooms, luminous growth, Ent-like living wards.
- Crags: guild exteriors, blast-gate pieces, furnace-fire strips, foreman banners, cracked ground, yellow crystals.
- Holy Reach and High-Reach: chapel pieces, altars, candelabra, statues, law monuments, white and blue-gray ruins, blue crystals.
- Port Marrow: dock buildings, salvaged hull houses, towers, crane silhouettes, cargo details, water boards.
- Canaan and Bazaar ruins: desert buildings, vault towers, market decor, palms, cactus clusters, scale decor, sand ruins, relic crystals.
- Void Rift and Sanctum: cave entrance, obsidian house/cell pieces, ritual floors, black tower, skeletons, lanterns, rafflesia, warning signs, boulders, broken boat, violet crystals. Sanctum architecture uses small dark-purple derived variants of the same Craftpix void/swamp source pieces so it reads less like ordinary swamp housing.
- Village barriers and terrain: fences, stone barriers, gates, guard stalls, wells, signposts, and road patches used for town borders, safe-road reads, toll checks, and support camps.
- Enemy camps: curated den, barricade, crater, cache, watch, and boulder props from the home and rock packs combine with existing Void structures so each camp reads as a different threat source.

Runtime placement data lives in `./src/data/world-landmarks.ts`. It groups these images into town cores, dominant silhouettes, sub-town clusters, vendor/service fixtures, danger edges, shrines, docks, archives, and sparse biome props.

The player-facing landmark readback is documented in `./docs/world-building.md` under Visual Differentiation and Confirmed Landmark Readback.

Screenshots for all outdoor areas can be refreshed with:

```powershell
bun.cmd run screenshot:world
```

Source packs used:

- https://craftpix.net/freebies/free-tower-defense-2d-vector-tileset/
- https://craftpix.net/freebies/free-poison-swamp-game-tileset-and-environment-pack/
- https://craftpix.net/freebies/free-chapel-pixel-art-top-down-asset-pack/
- https://craftpix.net/freebies/free-top-down-pixel-art-guild-hall-asset-pack/
- https://craftpix.net/freebies/free-pirate-bay-tileset-pixel-art-for-cyberpunk/
- https://craftpix.net/freebies/free-forest-objects-top-down-pixel-art/
- https://craftpix.net/freebies/free-top-down-ruins-pixel-art/
- https://craftpix.net/item/top-down-crystals-pixel-art/
- https://craftpix.net/freebies/free-top-down-pixel-art-cave-objects/
- https://craftpix.net/freebies/free-rocky-area-objects-pixel-art/
- https://craftpix.net/freebies/free-2d-top-down-pixel-dungeon-asset-pack/
- https://craftpix.net/freebies/free-cursed-land-top-down-pixel-art-tileset/
- https://craftpix.net/freebies/free-top-down-trees-pixel-art/
- https://craftpix.net/freebies/free-bridges-top-down-pixel-art-asset-pack/
- https://craftpix.net/freebies/free-village-pixel-tileset-for-top-down-defense/
- https://craftpix.net/product/green-village-top-down-pixel-art-tileset/
- https://craftpix.net/freebies/main-characters-home-free-top-down-pixel-art-asset/
- https://craftpix.net/freebies/free-rocks-and-stones-top-down-pixel-art/

When adding more world art, keep the runtime files small, named by readable faction or biome role, and registered through the normal client image source list.

Do not bulk-extract source archives into runtime folders. Curate only the PNGs needed for a player-facing read, give them stable lowercase names, and update `./docs/world-building.md` when a new landmark changes what the area communicates.

# Magic Map Shmup

Browser-playable engine example for a seeded, tile-map-driven shmup route built from the public map API.

From the repository root, run `bun run build:example:magic-map-shmup`, then open `examples/magic-map-shmup/index.html` directly or serve the repository locally. Move with WASD or arrows, fire with Space, retry instantly with R, and toggle help with H.

The map seed defines walls, hazards, chart pickups, enemy spawns, and the exit gate. Gameplay uses the generated map for visible route shape, collision, hazard checks, enemy line-of-sight, and objective placement.

# Portable runtime navigation

Portable navigation is authored as ordinary component data in `.hyperfocus/project.json`. It uses the existing tile values in that same JSON document and adds no navigation sidecar, generated behavior wrapper, or per-agent file. Binary assets remain in `.hyperfocus/assets.hfp`, so navigation preserves the two canonical project files.

The runtime adapter compiles enabled behavior components whose module is `builtin:navigate` into a statically registered behavior backed by the first-party `GridNavigator` A* workspace. The editor Play path, offline standalone build, and CLI build all register the same adapter. There is no evaluated project string or hidden service dependency.

## Component values

- `module`: required literal `builtin:navigate`.
- `targetX` and `targetY`: required finite world coordinates inside the tilemap.
- `speed`: finite world units per second, greater than 0 and at most 10,000; defaults to 120.
- `stopDistance`: finite distance from 0 through one tile; defaults to 0.5.
- `diagonal`: optional boolean; defaults to `false`.
- `allowCornerCutting`: optional boolean; defaults to `false`. It only affects diagonal paths.
- `action`: optional bounded action name. When present, the agent moves only while that project action is active.

Cells listed by `tilemap.solidValues` are blocked. When that list is absent, every nonzero tile value is blocked, matching portable collision behavior. Agents follow tile-center waypoints and cap velocity so a fixed tick lands on a waypoint rather than oscillating around it. The last segment targets the exact authored coordinates.

## Bounds and preflight

The default standalone limits are:

- 262,144 grid cells;
- 512 enabled navigation agents across the project;
- 100,000 visited cells per search;
- 4,096 cells retained per agent path.

Preflight runs an initial route for every enabled navigation agent. Malformed values, out-of-map positions, blocked or unreachable targets, exhausted search budgets, and overlong paths are explicit location-bearing errors. A standalone build does not silently omit an invalid agent. Runtime workspaces use typed arrays allocated to configured bounds, and retained paths are limited per agent.

The public adapter functions are `auditNavigationProject2D` and `createNavigationBehaviorRegistry2D`. A custom host passes the returned registry through the `behaviors` option of `createPlayableWorld`; official editor and standalone paths do this automatically. A registry owns mutable per-agent path cursors and belongs to exactly one world. Create a fresh registry for each live world, replay, rollback peer, or test simulation.

Each registry allocates reusable bounded A* workspaces and one shared path scratch buffer. A replan retains only the exact path length for that agent rather than allocating a second maximum-sized buffer. This keeps transient allocation independent of the number of agents while preserving isolated state per world.

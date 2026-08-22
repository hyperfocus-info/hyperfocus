# Portable platformer controller

`builtin:platformer` is a deterministic, fixed-step controller shared by Editor Play, standalone HTML builds, and the CLI build lane. It is authored as ordinary component data inside `.hyperfocus/project.json`; it creates no scripts, wrapper modules, or sidecar files. Projects still have exactly two canonical files: `.hyperfocus/project.json` and `.hyperfocus/assets.hfp`.

```json
{
  "id": "player-platformer",
  "type": "behavior",
  "enabled": true,
  "values": {
    "module": "builtin:platformer",
    "runSpeed": 220,
    "gravity": 1800,
    "jumpSpeed": 650,
    "maxFallSpeed": 900,
    "coyoteMs": 100,
    "jumpBufferMs": 100,
    "jumpCutMultiplier": 0.5,
    "groundProbe": 0.05,
    "leftAction": "move-left",
    "rightAction": "move-right",
    "jumpAction": "jump"
  }
}
```

The entity must also have one enabled solid `box` or `aabb` collider. Do not add a generic `input` component to the same entity: the platformer controller owns horizontal movement so its speed cannot be applied twice. The three action names must exist in `settings.input`; physical keys remain portable project bindings rather than controller-specific data.

## Deterministic semantics

- Horizontal input sets velocity to `-runSpeed`, `0`, or `runSpeed`. Opposing actions cancel.
- Gravity advances vertical velocity once per fixed tick and clamps it to `maxFallSpeed`.
- Jump starts only on the rising edge of `jumpAction`. Holding the action cannot retrigger a jump.
- `coyoteMs` permits a late jump after leaving a ledge. `jumpBufferMs` remembers an early press and consumes it when the entity lands.
- Releasing jump while rising multiplies upward velocity by `jumpCutMultiplier`, producing a shorter jump.
- Horizontal and vertical movement use the runtime's swept AABB collision path. Solid entities and nonzero (or configured `solidValues`) tile cells block motion, so high velocity cannot tunnel through a thin floor or ceiling.
- A downward collision marks the controller grounded; an upward collision clears upward velocity. A small `groundProbe` preserves grounded state at exact resting contact.
- World snapshots include vertical velocity, grounded/coyote/buffer timers, and previous actions. Restoring a snapshot with jump held does not invent a second rising edge.

All controller values are validated before simulation and during editor/CLI build preflight. Speeds and gravity are bounded to `10,000`, coyote and buffer windows to `1,000 ms`, `jumpCutMultiplier` to `0..1`, and `groundProbe` to the project tile size. Invalid controllers block a build with an explicit diagnostic.

The `platformer` starter uses the values above. They are defaults, not hidden engine state, so another engine can read or translate the same JSON without depending on Hyperfocus-generated code.

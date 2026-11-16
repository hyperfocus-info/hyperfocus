# Fire and shallow flood

`environment.hazards` binds at most 32 stationary render-only entities with box
contact volumes. Position, scale and yaw define their footprint and contact volume. Optional
`activationSurfaceId` enables a zone only after an existing environment surface
breaks or completes its scheduled transition. The Combat inspector and portable
`scene3d.set-combat` command author the same validated data.

Fire applies `damage` every `intervalFrames` while a living, unprotected fighter
overlaps. It never adds hitstun, impulse, hitstop, DI opportunities, blood impacts
or punch sounds. Damage uses the real combat health and round-resolution path;
exchange evidence reports `fire-exposure`. Leaving stops exposure immediately;
there is no lingering burn. The per-pair next-damage frame survives leaving, so
repeated boundary crossing cannot accelerate damage. Hurt voice and ordinary
apparatus-break sound remain separate from the dedicated nearby-fire texture.

Flood supplies `groundSpeedScale` for voluntary grounded walking, sprinting and
ground dashes. It does not scale hitstun, DI, attack travel or airborne movement.
Both control seats and AI pass through the same rule. It is shallow traversal
drag, not swimming, buoyancy, electricity, drowning or a retained wet status.

Contacts and bounded enter/exit/damage traces are captured in environment state.
Cadence advances only from the live combat step, not presentation, hitstop,
round interludes, result menus or the host's paused loop. Round recovery preserves
the arena; a new match resets it. Presentation adds up to twelve local flames or
water ripples per active zone, capped by the scene's remaining effect capacity.
Repeated presentation of one frame replaces the owned effects rather than
accumulating particles.
The authored zone mesh also supplies the particle silhouette: the city uses a
tapered faceted flame instead of upright box markers. Rising flames start above
the actual floor and retain the same allocation and damage cadence.

Verification: `session.test.ts` covers identical fighter rules, activation,
protection, leaving/reentry and saved cadence. `runtime.test.ts` exercises actual
movement, fire KO, round recovery, menus, local rollback and portable restore.
`rollback.test.ts` covers delayed network input convergence and replay seeking.
City authoring has its own ordinary-attack activation acceptance in the editor.

High-level AI (7?9) adds finite exposure/travel costs to its existing solid-aware
route graph. Only active hazards within 24 metres, on the fighter's level and
with an unobstructed sightline contribute; at most eight nearby volumes add
corners. Fire has a damage-rate cost and shallow water a travel-time cost. A dry
route competes with direct crossing rather than making hazardous space forbidden.
When the useful route crosses fire, the AI still approaches and takes the same
damage. Committed attacks, knockback and aerial pursuit keep their existing rules.
`routes.test.ts` covers hidden/inactive awareness and forced crossing;
`ai.test.ts` proves real AI9 detours, engagement and checkpoint reproduction.

Optional `audio.cues.hazardFire` and `hazardWater` are editable in Combat audio.
The fire cue uses short 0.46-second texture grains every 24 live frames for the
nearest two sources, with squared distance attenuation to silence at 24 metres.
At most four grains overlap briefly; they are not persistent loops. Water entry
emits one splash per fighter with an 18-frame boundary debounce. Effects gain
zero mutes both; interludes/results emit neither, and host pause suspends playback.
Audio checkpoint state rewinds cadence/debounce. `audio.test.ts` covers these
bounds; the existing host audio pause tests cover actual suspension. Dedicated
assets are supplied by the editor's deterministic Touch of Death audio cooker.

Not implemented: propagation, volumetric fluids, lingering burn/wet statuses,
or hazard-aware aerial/attack trajectory planning.

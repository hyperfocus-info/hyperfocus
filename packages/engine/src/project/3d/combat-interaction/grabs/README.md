# Grab timing and release

Grab startup is authored separately from the defender's tech window. Startup
locks only the attacker; range and obstruction are checked again when the hands
can connect. An incoming hit cancels the attempt without clearing its hitstun.
Round reset clears pending attempts alongside established grips.

Startup and tech duration are independently configurable. Fresh jump/dash semantic tech and fresh grab
both work; a held tech input cannot break a later grip.

Grab acquisition faces the opponent while stick intention still ranks nearby
tools. During a grip, the attacker's current stick determines release direction
and analog strength; the .3 deadzone releases upward. Defender DI steers that
impulse. `grappleVerticalSpeedScale` scales the neutral 4 m/s or directional 2 m/s
upward release; `grappleSpeed` controls horizontal release. Optional
`grappleRecoveryFrames` and `grappleWhiffFrames` default to 17 and 18; visual
follow-through uses the configured duration. The game's
[tuning guide](../../../../../examples/touch-of-death/docs/touch-of-death.md)
owns current Touch of Death values; generic defaults preserve older consumers.

`timing.test.ts` covers startup interruption and range recheck, both seats, every
tech frame, neutral/analog throws and DI, and exact saved-state reconstruction.
`runtime.test.ts` verifies both seats through real 3D inputs: fresh Jump/Dash at
contact and five frames later succeed, six frames later fail, and pre-held input
does not tech. It covers no extra movement on tech, startup interruption,
duplicate prevention,17-frame release lock, reset and checkpoint reconstruction.

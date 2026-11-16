# Directed fighters in Touch of Death

The normal Touch of Death setup and `scene3d.setup-directed-fighters` install
fighter C's existing model generators and the reviewed action presenter. Editor
Play and standalone exports use the same consumer-local adapter. Engine primitive
presentation remains generic; the directed model adapter stays in this consumer. The [Art Constitution](../../../../docs/touch-of-death-art-constitution.md)
owns taste and scoped approvals; integration does not designate a GOLDEN.

The Combat inspector exposes **Install directed fighter models and motion** for
existing articulated fighters. It is one undoable operation. The headless
[installer](../../../../../../../../apps/engine-editor/scripts/touch-of-death-fighters/README.md) uses the same
command, verifies the current project hash and retains the canonical pair first.
Physics roots, combat configuration, city layout, input and saved wardrobe IDs
remain intact. The generated meshes are ordinary editable packed GLBs; the
sampled motion bank is a packed JSON asset. Neither runtime depends on `.local`.

`assets.ts` shares the evaluated C generators and checks the durable accepted
forearm hashes before asset writes. `contract.ts` owns explicit root/rig bindings
and local rest transforms under `hyperfocusTouchOfDeathArt`. Runtime construction
rejects missing parts and malformed motion banks. `universal-bank.json` is sampled
from the existing CC0 Quaternius source by `verification/art-direction/universal-source.ts`;
the file retains its source path, source hash and license. Update it deliberately
with source evaluation evidence, rather than hand-editing joint samples.

The adapter uses real physics contacts for grounded state at any city elevation.
It resets local motion history after rollback/teleport, samples simulation time,
keeps repeated renders stable, and binds each held object by its actual instance
ID. Flexible handles are per fighter so both players can hold nunchaku. Native
camera, HUD, effects, audio, damage, hit stop and weapon release remain authoritative.

Defeated fighters use `knockout.ts` to bind the existing directed meshes to the
final native ragdoll/recovery pose. A corpse torso is no longer a standing body
center; subtracting the standing root height and applying an ordinary action
buried the fighter in the floor. The adapter retains native head/hand anchors and
rotations, costume bindings and recovery overlays without changing physics or
asset bytes. Arena capture rejects detached knockout/recovery poses, in addition
to root framing. The integration regression covers settled corpses, evaluated
recovery poses, unchanged simulation and a detached head that must fail capture.

Knockout garment bindings invert the primitive limb axis and remove its overlap
padding before posing the authored mesh. Positive-Y knee caps therefore remain
at the knee. The existing neck spans the moving jaw and collar; no mesh bytes or
approved costume proportions change. Native upper limbs begin at shoulder/hip
anchors, and recovery blends shared joints before rebuilding limbs so elbows and
knees stay connected during the transition. The October 7 motion comparison is
under `.local/engine-perf/round-repair-20261007/`; it is a silent native study and
does not constitute a sound-on arena album or owner taste approval.

The wardrobe bridge retains palette/image materials and existing variant IDs.
Legacy alternate clothes, hair and shoes receive explicit frame conversions;
the default uses the directed model. Dressing previews pose the new rig separately
without moving the live fight. Old body parts remain in portable data for their
existing profile/effect bindings and are hidden by the directed presenter.
Cosmetic movement, hit and recovery style overrides still need explicit adaptation
to this rig; they do not currently replace its standard action poses. The existing
Edit viewport continues to show transform proxies; use Play for model evaluation.

Verification: `bun test packages/engine/examples/touch-of-death/src/presentation/art-direction/integration`.
The native tests compare simulation with/without the new visual parts, elevated
support, repeated rendering, command history and repeat installation. Inspect
the real exported city as well: the art lab's smaller collision bodies and lower
travel speed are not a substitute for integration evidence. High-speed sprint
support, rigid joints and competitive balance remain distinct review concerns.

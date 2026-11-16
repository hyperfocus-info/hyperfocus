# Motion and retargeting evaluation

Inspect available authored clips, rig conventions, licensing and approved motion
references before building a procedural replacement. Record source file/hash,
clip name, original duration, root travel and adaptation. A requested source is a
comparison benchmark, not approval of its mannequin, every clip or the final result.

Render previous motion, source motion and adapted motion beside each other at matched
gameplay speed, phase and camera. Keep source timing visible. Check the transfer at
actual gameplay speed: preserving long source strides by slowing playback can produce
floating motion. Coordinate cadence, displacement, foot roll and root travel.

For each important animation, capture an isolated neutral clip, gameplay-distance
clip, actual contact/support clip and key-frame strip. Contact may be an opponent,
ledge, held tool, landing surface or edited terrain boundary. Attack strips show anticipation,
pre-contact, contact, follow-through and recovery; locomotion strips show a full
stride including both support and swing phases. Use actual elapsed time for video
recording and retain timestamps. An in-place/neutral study must actually advance
its gait clock; duplicate static frames are not motion evidence.

Reuse the shared capture host with consumer-owned phase ticks. Uniform sampling
missed Pale Reach's short anticipation and aliased its fast gait; explicit phases
now enter the first capture pass. A planted-foot metric cannot establish weight:
the owner preferred Pale Reach's baseline over the objectively cleaner gait.
Keep that negative comparison visible when selecting future motion defaults.

Include start/stop/turn/attack sequences as well as isolated loops. A valid loop
can still snap at a state boundary. Keep the current gait during a stop while
blending toward guard; simultaneously changing gait and pose caused a measured
wrist jump in Touch of Death. Advance transitions in simulation time and check
that the complete pose freezes during hitstop, even with repeated render calls.
Use distinct actual speeds when claiming to evaluate walk and run.
Measure solved elbows as well as wrists. Touch of Death's wrist-only continuity
check missed an arm flip: its stopped hands used idle targets with running elbow
hints. Blend bend targets with the limb and sweep stops across the stride, not
only one chosen stop. Shortening a fast source's stride also requires reviewing
knee lift, pelvis bounce, torso sway and foot roll at the new speed; keeping their
full amplitude produced the owner's rejected exaggerated run.

Attack grammar: read → anticipation → commitment → impact → follow-through → recovery.
Vary heavy vs light through load, displacement, pose extremity, timing, reaction and
recovery before increasing VFX. Inspect silhouette, line of action, balance, mass
transfer, planted support, arcs and secondary motion. Damage, audio and effects
should agree with the contact frame.

Retargeting can preserve segment lengths and still produce invalid anatomy. When an
ankle target is compressed or moved, recompute the knee bend plane; a stale source
knee point may flip the solve. For a human forward-knee rig, validate the signed
flexion in its defined local/travel frame through the entire cycle, both legs,
speed changes and start/stop blends. Do not apply that sign convention blindly to
other anatomies or reverse travel. Check loop seams, reach clamps, root displacement,
foot sliding, ankle/foot orientation and joint continuity separately.

Touch of Death's [native source-transfer test](../../../../apps/engine-editor/verification/art-direction/universal-locomotion.test.ts)
caught 439 backward-knee samples before repair and zero after in its tested sweep;
the [runtime validator](../../../../apps/engine-editor/verification/art-direction/validate-slice.ts)
checks actual locomotion transitions. These checks catch that defect, not artistic
weight or a universally correct gait. Current scoped owner acceptance lives in
the game's Art Constitution.

Check the real action catalogue, including generated weapon variants. An existing
name is not proof of a moving clip: preview held-tool locomotion with a real tool.
Test rapid follow-up timing, both hands on one shared grip, and repeated renders
during hit stop. Carrying a tool replaces the gait's elbow hints as well as its
wrist targets. Include utility weapons and their effects in native verification;
ordinary hit contacts do not exercise spray/deployment capacity.

Weapon variants inherit tactical intent, not a generic hand path. Compare light
and heavy load/contact/exit silhouettes and compare anti-air, lunge, body and
counter roles within each family. Unique names or scaled frame data do not prove
distinct motion. Test the actual trajectory signatures, then inspect effects-off
clips. Flexible tools require independent handle/chain motion, persistent handle
identity and reachable hand transfers. Validate their vertices through transfer,
not just the active wrist. Keep startup, contact, damage and recovery bound to the
same authored move; pair high damage with visible commitment and actual cost.
